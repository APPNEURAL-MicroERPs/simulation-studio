import { HttpError } from "./http";

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

async function secureEqual(provided: string, expected: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([digest(provided), digest(expected)]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index % left.length] ?? 0) ^ (right[index % right.length] ?? 0);
  }
  return difference === 0;
}

export async function requireStudioAuth(request: Request, env: Env): Promise<void> {
  if (!env.STUDIO_ADMIN_TOKEN) throw new HttpError(503, "studio_auth_not_configured", "Simulation Studio admin token is not configured.");
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || !await secureEqual(match[1] ?? "", env.STUDIO_ADMIN_TOKEN)) {
    throw new HttpError(401, "unauthorized", "A valid Simulation Studio admin token is required.");
  }
}
