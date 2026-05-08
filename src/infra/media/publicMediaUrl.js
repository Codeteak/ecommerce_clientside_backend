import { env } from "../../config/env.js";

export function toPublicMediaUrl(storageKey) {
  const raw = String(storageKey || "").trim();
  if (!raw) return null;

  // Some datasets store absolute URLs instead of object-storage keys.
  // In that case, preserve the URL as-is.
  if (/^https?:\/\//i.test(raw)) return raw;

  const key = raw.replace(/^\/+/, "");
  if (!key) return null;

  const base = String(env.OBJECT_STORAGE_PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return null;

  return `${base}/${key}`;
}
