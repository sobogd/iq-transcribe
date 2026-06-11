import crypto from "crypto";

// Resolve the owner of a request into a stable key like "telegram:123" or
// "device:<uuid>". Telegram identity is cryptographically verified via initData
// HMAC; device identity is an anonymous client-generated id (data isolation,
// not access control). Returns null when no identity is present.

const TG_MAX_AGE_SEC = 60 * 60 * 24; // reject initData older than 24h

// Allowlist gate. If ALLOWED_TG_IDS is set (comma-separated Telegram user ids),
// only those Telegram users pass — device/browser identities are rejected,
// making the app effectively Telegram-only for named people. Empty => open.
export function isAllowed(owner: string): boolean {
  const list = (process.env.ALLOWED_TG_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  if (owner.startsWith("telegram:")) return list.includes(owner.slice(9));
  return false;
}

export function resolveOwner(req: Request): string | null {
  const initData = req.headers.get("x-telegram-init-data");
  if (initData) {
    const tgId = verifyTelegramInitData(initData);
    if (tgId) return `telegram:${tgId}`;
    return null; // initData present but invalid → treat as unauthenticated
  }

  const deviceId = req.headers.get("x-device-id");
  if (deviceId && /^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) {
    return `device:${deviceId}`;
  }

  return null;
}

// Validate Telegram WebApp initData. Returns the user id string if valid.
// Algorithm: secret = HMAC_SHA256("WebAppData", botToken);
//            hash   = HMAC_SHA256(secret, dataCheckString).
function verifyTelegramInitData(initData: string): string | null {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (computed !== hash) return null;

  // freshness
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > TG_MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get("user") || "{}");
    return user?.id ? String(user.id) : null;
  } catch {
    return null;
  }
}
