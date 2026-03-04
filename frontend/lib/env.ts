/**
 * Environment variable validation.
 * Import this in API routes to get typed, validated env vars.
 * Throws at runtime if a required variable is missing.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // Auth
  get authSecret() { return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || ""; },
  get nextauthUrl() { return optional("NEXTAUTH_URL", "http://localhost:3000"); },
  get authUsername() { return required("AUTH_USERNAME"); },
  get authPasswordHash() { return required("AUTH_PASSWORD_HASH"); },

  // Vast.ai
  get vastApiKey() { return required("VAST_API_KEY"); },
  get vastInstanceId() { return required("VAST_INSTANCE_ID"); },

  // GPU Worker
  get gpuWorkerUrl() { return required("GPU_WORKER_URL"); },
  get gpuWorkerToken() { return required("GPU_WORKER_TOKEN"); },

  // Pexels
  get pexelsApiKey() { return required("PEXELS_API_KEY"); },

  // Anthropic
  get anthropicApiKey() { return required("ANTHROPIC_API_KEY"); },

  // Canva (optional for MVP)
  get canvaClientId() { return optional("CANVA_CLIENT_ID"); },
  get canvaClientSecret() { return optional("CANVA_CLIENT_SECRET"); },
  get canvaAccessToken() { return optional("CANVA_ACCESS_TOKEN"); },

  // R2 (optional for MVP)
  get r2AccountId() { return optional("R2_ACCOUNT_ID"); },
  get r2AccessKey() { return optional("R2_ACCESS_KEY"); },
  get r2SecretKey() { return optional("R2_SECRET_KEY"); },
  get r2Bucket() { return optional("R2_BUCKET", "avatar-videos"); },
};

/**
 * Check which services are configured (have their env vars set).
 * Does NOT throw — returns a status map.
 */
export function checkEnvStatus(): Record<string, { configured: boolean; vars: string[] }> {
  const check = (...vars: string[]) => ({
    configured: vars.every((v) => !!process.env[v]),
    vars,
  });

  return {
    auth: {
      configured: !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) && !!process.env.AUTH_USERNAME && !!process.env.AUTH_PASSWORD_HASH,
      vars: ["AUTH_SECRET", "AUTH_USERNAME", "AUTH_PASSWORD_HASH"],
    },
    vast: check("VAST_API_KEY", "VAST_INSTANCE_ID"),
    worker: check("GPU_WORKER_URL", "GPU_WORKER_TOKEN"),
    pexels: check("PEXELS_API_KEY"),
    anthropic: check("ANTHROPIC_API_KEY"),
    canva: check("CANVA_ACCESS_TOKEN"),
    r2: check("R2_ACCOUNT_ID", "R2_ACCESS_KEY", "R2_SECRET_KEY"),
  };
}
