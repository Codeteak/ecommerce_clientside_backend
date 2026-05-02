/**
 * MSG91 Flow API (v5) — single-recipient transactional SMS (`POST /api/v5/flow`).
 */

const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow";

/**
 * Normalizes a phone string to MSG91 `mobiles` format: country code + number, digits only (e.g. 9198XXXXXXXX).
 * Input is expected to already satisfy storefront validation (E.164-style).
 */
export function normalizePhoneForMsg91(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0") && /^0[6-9]/.test(digits)) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return digits;
  }
  throw new Error("Invalid phone number for SMS");
}

/**
 * @param {object} opts
 * @param {string} opts.authKey
 * @param {string} opts.templateId
 * @param {string} opts.mobileRaw — customer phone (any common format)
 * @param {string} opts.otp — 6-digit OTP (template ##otp## → VAR1)
 * @param {string} opts.shopDisplayName — shop name for template ##name## → VAR2
 * @param {string} [opts.shortUrl="0"]
 * @param {number} [opts.timeoutMs=15000]
 * @param {typeof fetch} [opts.fetchFn=fetch]
 */
export async function sendMsg91FlowOtp({
  authKey,
  templateId,
  mobileRaw,
  otp,
  shopDisplayName,
  shortUrl = "0",
  timeoutMs = 15_000,
  fetchFn = fetch
}) {
  const mobiles = normalizePhoneForMsg91(mobileRaw);
  const name = String(shopDisplayName || "our store")
    .trim()
    .slice(0, 120);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchFn(MSG91_FLOW_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        authkey: authKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        template_id: templateId,
        short_url: shortUrl,
        recipients: [
          {
            mobiles,
            VAR1: String(otp),
            VAR2: name
          }
        ]
      }),
      signal: controller.signal
    });
  } catch (err) {
    const msg = err?.name === "AbortError" ? "MSG91 request timed out" : err?.message || "MSG91 request failed";
    throw new Error(msg);
  } finally {
    clearTimeout(t);
  }

  const text = await res.text();

  if (!res.ok) {
    let errBody = {};
    try {
      errBody = JSON.parse(text);
    } catch {
      /* plain-text or HTML error body */
    }
    const detail =
      typeof errBody?.message === "string" ? errBody.message : text.slice(0, 500);
    throw new Error(`MSG91 HTTP ${res.status}: ${detail}`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`MSG91 returned non-JSON body (HTTP ${res.status})`);
  }

  const type = String(body?.type || "").toLowerCase();
  if (type === "error" || body?.hasError === true) {
    const detail = body?.message || body?.errors || text.slice(0, 500);
    throw new Error(`MSG91 error: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }

  return body;
}
