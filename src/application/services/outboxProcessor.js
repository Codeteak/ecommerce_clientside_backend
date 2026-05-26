/*
This file claims outbox batches and processes them with retry handling.
*/
import { addOutboxMetric } from "../../infra/metrics/outboxMetrics.js";
import { getRequestLogger } from "../../infra/logging/requestContext.js";

function parsePayload(payload) {
  if (payload == null) return {};
  if (typeof payload === "object") return payload;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return {};
}

/** @type {{ payloadColumn: string } | null} */
let resolvedOutboxSchema = null;

/** Clears cached schema (tests, or after running migration without restart). */
export function resetOutboxSchemaCacheForTests() {
  resolvedOutboxSchema = null;
}

async function resolveOutboxSchema(pool) {
  if (resolvedOutboxSchema) return resolvedOutboxSchema;

  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'outbox_messages'`
  );

  const columns = new Set(rows.map((r) => r.column_name));
  const payloadColumn = columns.has("payload")
    ? "payload"
    : columns.has("payload_json")
      ? "payload_json"
      : null;
  const required = ["status", "retry_count", "processed_at", "event_type", "created_at", "id"];
  const missing = required.filter((name) => !columns.has(name));

  if (!payloadColumn || missing.length) {
    throw new Error(
      `outbox_messages is missing required worker columns: ${[
        ...missing,
        ...(payloadColumn ? [] : ["payload or payload_json"])
      ].join(", ")}. Run: npm run db:migrate (applies 036_outbox_worker_columns.sql)`
    );
  }

  resolvedOutboxSchema = { payloadColumn };
  return resolvedOutboxSchema;
}

async function claimPendingBatch(client, batchSize, payloadColumn) {
  const { rows } = await client.query(
    `WITH claimed AS (
       SELECT id
       FROM outbox_messages
       WHERE status = 'pending'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE outbox_messages o
     SET status = 'processing'
     FROM claimed
     WHERE o.id = claimed.id
     RETURNING o.id, o.event_type, o.${payloadColumn} AS payload, o.retry_count, o.created_at`,
    [batchSize]
  );
  return rows;
}

async function updateDone(client, id) {
  await client.query(
    `UPDATE outbox_messages
     SET status = 'done',
         processed_at = now()
     WHERE id = $1`,
    [id]
  );
}

function buildRetryDelayMs({ retryCount, baseMs, maxMs }) {
  const exponent = Math.max(0, retryCount - 1);
  const raw = Math.min(maxMs, baseMs * 2 ** exponent);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.round(raw * 0.2)));
  return Math.min(maxMs, raw + jitter);
}

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Outbox handler timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function updateFailure(client, id, nextRetryCount, maxRetries, payloadColumn, errMessage) {
  const isPermanent = nextRetryCount >= maxRetries;
  const nextStatus = isPermanent ? "failed" : "pending";
  if (!isPermanent) {
    await client.query(
      `UPDATE outbox_messages
       SET status = $2,
           retry_count = $3,
           processed_at = NULL
       WHERE id = $1`,
      [id, nextStatus, nextRetryCount]
    );
  } else {
    await client.query(
      `UPDATE outbox_messages
       SET status = $2,
           retry_count = $3,
           processed_at = now(),
           ${payloadColumn} = jsonb_build_object(
             'original', COALESCE(${payloadColumn}, '{}'::jsonb),
             'dead_letter', jsonb_build_object(
               'failed_at', now(),
               'error', $4,
               'retry_count', $3
             )
           )
       WHERE id = $1`,
      [id, nextStatus, nextRetryCount, String(errMessage || "unknown_error")]
    );
  }
  return { isPermanent, nextStatus };
}

export async function processOutboxBatch({
  pool,
  handlers,
  logger,
  batchSize,
  maxRetries,
  retryBaseMs = 250,
  retryMaxMs = 30000,
  handlerTimeoutMs = 10000
}) {
  const log = logger ?? getRequestLogger();
  const { payloadColumn } = await resolveOutboxSchema(pool);
  const claimClient = await pool.connect();
  let claimedRows = [];
  try {
    await claimClient.query("BEGIN");
    claimedRows = await claimPendingBatch(claimClient, batchSize, payloadColumn);
    await claimClient.query("COMMIT");
  } catch (err) {
    try {
      await claimClient.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    claimClient.release();
  }

  if (!claimedRows.length) {
    return { claimed: 0, done: 0, retried: 0, failed: 0 };
  }
  addOutboxMetric("claimed", claimedRows.length);

  let done = 0;
  let retried = 0;
  let failed = 0;

  const updateClient = await pool.connect();
  try {
    for (const row of claimedRows) {
      const handler = handlers[row.event_type];
      const payload = parsePayload(row.payload);
      const retryCount = Number(row.retry_count || 0);

      log.info(
        {
          event: "outbox.event.processing_started",
          outboxMessageId: row.id,
          eventType: row.event_type,
          retryCount
        },
        "Outbox event processing started"
      );

      try {
        if (typeof handler !== "function") {
          throw new Error(`No outbox handler registered for event type: ${row.event_type}`);
        }

        await withTimeout(
          handler(payload, {
            logger: log,
            eventId: row.id,
            eventType: row.event_type
          }),
          handlerTimeoutMs
        );
        await updateDone(updateClient, row.id);
        done += 1;
        addOutboxMetric("processed");
        log.info(
          {
            event: "outbox.event.success",
            outboxMessageId: row.id,
            eventType: row.event_type
          },
          "Outbox event processed successfully"
        );
      } catch (err) {
        if (String(err?.message || "").toLowerCase().includes("timed out")) {
          addOutboxMetric("handler_timeout");
        }
        const nextRetryCount = retryCount + 1;
        const retryDelayMs = buildRetryDelayMs({
          retryCount: nextRetryCount,
          baseMs: retryBaseMs,
          maxMs: retryMaxMs
        });
        const { isPermanent } = await updateFailure(
          updateClient,
          row.id,
          nextRetryCount,
          maxRetries,
          payloadColumn,
          err?.message
        );

        if (isPermanent) {
          failed += 1;
          addOutboxMetric("failed");
          addOutboxMetric("dead_lettered");
          log.error(
            {
              event: "outbox.event.failed_permanently",
              outboxMessageId: row.id,
              eventType: row.event_type,
              retryCount: nextRetryCount,
              maxRetries,
              err
            },
            "Outbox event permanently failed"
          );
        } else {
          retried += 1;
          addOutboxMetric("retried");
          log.warn(
            {
              event: "outbox.event.retry_scheduled",
              outboxMessageId: row.id,
              eventType: row.event_type,
              retryCount: nextRetryCount,
              maxRetries,
              retryDelayMs,
              err: err?.message
            },
            "Outbox event failed and will be retried on next poll"
          );
        }
      }
    }
  } finally {
    updateClient.release();
  }

  return {
    claimed: claimedRows.length,
    done,
    retried,
    failed
  };
}
