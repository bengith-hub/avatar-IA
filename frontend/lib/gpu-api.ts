import { getWorkerUrlFromInstance } from "@/lib/vast-api";

// Cache resolved worker URL for 60 seconds to avoid calling Vast.ai on every request
let _cachedUrl: string | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function resolveWorkerUrl(): Promise<string> {
  // 1. If GPU_WORKER_URL is set and is NOT an ngrok URL, use it directly
  const envUrl = process.env.GPU_WORKER_URL;
  if (envUrl && !envUrl.includes("ngrok")) {
    return envUrl.replace(/\/$/, "");
  }

  // 2. Return cached URL if still fresh
  if (_cachedUrl && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedUrl;
  }

  // 3. Auto-discover from Vast.ai
  const discovered = await getWorkerUrlFromInstance();
  if (discovered) {
    _cachedUrl = discovered.replace(/\/$/, "");
    _cachedAt = Date.now();
    return _cachedUrl;
  }

  // 4. Fallback: use env var even if it's ngrok (better than nothing)
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }

  throw new Error(
    "Impossible de déterminer l'URL du worker GPU. " +
    "La VM est peut-être éteinte ou GPU_WORKER_URL n'est pas configuré."
  );
}

function workerHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}`,
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "AvatarIA-Worker/1.0",
  };
}

function isNgrokErrorPage(body: string): boolean {
  return (
    body.includes("ERR_NGROK") ||
    (body.includes("ngrok") && body.includes("<html")) ||
    (body.includes("Tunnel") && body.includes("<html"))
  );
}

function isHtmlPage(body: string): boolean {
  return body.includes("<!DOCTYPE") || body.trimStart().startsWith("<html");
}

/** Read response body as text and detect ngrok HTML pages (even on 200). */
async function safeResponseJson(res: Response, action: string): Promise<unknown> {
  const body = await res.text();

  // Detect ngrok tunnel error pages
  if (isNgrokErrorPage(body)) {
    throw new Error(
      `Le tunnel ngrok a renvoyé une page d'erreur (${action}). L'URL du tunnel a peut-être changé. Vérifiez GPU_WORKER_URL.`
    );
  }

  // Detect any HTML response (not JSON) — likely ngrok interstitial or proxy error
  if (isHtmlPage(body)) {
    throw new Error(
      `Le worker a renvoyé du HTML au lieu de JSON (${action}, HTTP ${res.status}). Le tunnel ngrok est peut-être inactif ou l'URL a changé.`
    );
  }

  if (!res.ok) {
    throw workerError(action, res.status, body);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `Réponse invalide du worker (${action}, HTTP ${res.status}). Contenu : ${body.substring(0, 200)}`
    );
  }
}

function workerError(action: string, status: number, body: string): Error {
  // Try to extract JSON error message from worker
  try {
    const json = JSON.parse(body);
    const detail = json.detail ?? json.error ?? json.message;
    if (detail) return new Error(`Worker: ${detail}`);
  } catch {
    // Not JSON
  }
  return new Error(`Erreur worker ${action} (HTTP ${status}): ${body.substring(0, 200)}`);
}

function connectionError(action: string, err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);

  // Already a descriptive error from safeResponseJson
  if (msg.includes("tunnel") || msg.includes("Worker:") || msg.includes("worker")) {
    return err instanceof Error ? err : new Error(msg);
  }

  if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED")) {
    return new Error(
      `Connexion refusée (${action}). La VM est peut-être éteinte ou le tunnel ngrok n'est pas lancé.`
    );
  }
  if (msg.includes("ETIMEDOUT")) {
    return new Error(
      `Timeout de connexion (${action}). La VM met peut-être du temps à répondre.`
    );
  }
  if (msg.includes("ENOTFOUND")) {
    return new Error(
      `URL introuvable (${action}). Vérifiez que GPU_WORKER_URL est correcte.`
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

export async function workerHealth() {
  try {
    const url = await resolveWorkerUrl();
    const res = await fetch(`${url}/health`, {
      headers: { "ngrok-skip-browser-warning": "true", "User-Agent": "AvatarIA-Worker/1.0" },
    });
    return await safeResponseJson(res, "health");
  } catch (err) {
    throw connectionError("health", err);
  }
}

export async function generateVideo(body: {
  text: string;
  language: string;
  avatar_id: string;
  background_url?: string;
  emotion?: string;
  format?: string;
}) {
  try {
    const url = await resolveWorkerUrl();
    const res = await fetch(`${url}/generate`, {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify(body),
    });
    return await safeResponseJson(res, "generate");
  } catch (err) {
    throw connectionError("generate", err);
  }
}

export async function getJobStatus(jobId: string) {
  try {
    const url = await resolveWorkerUrl();
    const res = await fetch(`${url}/status/${jobId}`, {
      headers: workerHeaders(),
    });
    return await safeResponseJson(res, "status");
  } catch (err) {
    throw connectionError("status", err);
  }
}

export async function listJobs() {
  try {
    const url = await resolveWorkerUrl();
    const res = await fetch(`${url}/jobs`, {
      headers: workerHeaders(),
    });
    return await safeResponseJson(res, "jobs");
  } catch (err) {
    throw connectionError("jobs", err);
  }
}

export async function downloadVideo(jobId: string) {
  try {
    const url = await resolveWorkerUrl();
    const res = await fetch(`${url}/download/${jobId}`, {
      headers: workerHeaders(),
    });
    if (!res.ok) {
      const body = await res.text();
      if (isNgrokErrorPage(body) || isHtmlPage(body)) {
        throw new Error(
          "Le tunnel ngrok a renvoyé une erreur au lieu du fichier vidéo. Vérifiez GPU_WORKER_URL."
        );
      }
      throw workerError("download", res.status, body);
    }
    // Check content-type to detect ngrok HTML on 200
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) {
      throw new Error(
        "Le worker a renvoyé du HTML au lieu d'une vidéo. Le tunnel ngrok est peut-être inactif."
      );
    }
    return res;
  } catch (err) {
    throw connectionError("download", err);
  }
}

export async function listAvatars() {
  try {
    const url = await resolveWorkerUrl();
    const res = await fetch(`${url}/avatars`, {
      headers: workerHeaders(),
    });
    return await safeResponseJson(res, "avatars");
  } catch (err) {
    throw connectionError("avatars", err);
  }
}

/**
 * Fetch a voice sample from the worker as base64.
 * Returns null if no voice sample is available on the worker.
 */
export async function fetchWorkerVoiceSampleBase64(): Promise<{
  base64: string;
  filename: string;
} | null> {
  try {
    const url = await resolveWorkerUrl();
    const listRes = await fetch(`${url}/voice-samples`, {
      headers: workerHeaders(),
    });
    const samples = (await safeResponseJson(listRes, "voice-samples")) as {
      name: string;
    }[];
    if (!Array.isArray(samples) || samples.length === 0) return null;

    const filename = samples[0].name;
    const fileRes = await fetch(`${url}/voice-samples/${encodeURIComponent(filename)}`, {
      headers: workerHeaders(),
    });
    if (!fileRes.ok) return null;

    const buf = Buffer.from(await fileRes.arrayBuffer());
    return { base64: buf.toString("base64"), filename };
  } catch {
    return null;
  }
}
