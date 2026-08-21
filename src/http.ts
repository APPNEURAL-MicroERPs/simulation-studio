const MAX_JSON_BYTES = 32_768;

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  return json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) throw new HttpError(413, "payload_too_large", "JSON payload exceeds 32 KiB.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new HttpError(413, "payload_too_large", "JSON payload exceeds 32 KiB.");
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must contain valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "invalid_payload", "Request body must be a JSON object.");
  return value as Record<string, unknown>;
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
  }
}

export function stringField(value: unknown, name: string, options: { required?: boolean; max?: number } = {}): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new HttpError(400, "missing_field", `${name} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new HttpError(400, "invalid_field", `${name} must be a string.`);
  const normalized = value.trim();
  if (!normalized && options.required) throw new HttpError(400, "missing_field", `${name} is required.`);
  if (normalized.length > (options.max ?? 200)) throw new HttpError(400, "invalid_field", `${name} is too long.`);
  return normalized || undefined;
}

