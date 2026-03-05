function workerUrl(): string {
  const url = process.env.GPU_WORKER_URL;
  if (!url) throw new Error("GPU_WORKER_URL is not set");
  return url.replace(/\/$/, "");
}

function workerHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}`,
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "AvatarIA-Worker/1.0",
  };
}

function isOfflineError(status: number, body: string): boolean {
  return (
    body.includes("ERR_NGROK") ||
    body.includes("ngrok") ||
    body.includes("Tunnel") ||
    body.includes("<!DOCTYPE") ||
    body.includes("<html")
  );
}

/** Read response body as text and detect ngrok HTML pages (even on 200). */
async function safeResponseJson(res: Response, action: string): Promise<unknown> {
  const body = await res.text();
  if (isOfflineError(res.status, body)) {
    throw new Error(
      "La VM GPU est éteinte ou le tunnel est inactif. Démarrez la VM depuis le Dashboard avant de générer."
    );
  }
  if (!res.ok) {
    throw workerError(action, res.status, body);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `Réponse invalide du worker (${action}). Le tunnel ngrok est peut-être inactif.`
    );
  }
}

function workerError(action: string, status: number, body: string): Error {
  if (isOfflineError(status, body)) {
    return new Error(
      "La VM GPU est éteinte ou le tunnel est inactif. Démarrez la VM depuis le Dashboard avant de générer."
    );
  }
  // Try to extract JSON error message
  try {
    const json = JSON.parse(body);
    if (json.detail) return new Error(json.detail);
    if (json.error) return new Error(json.error);
  } catch {
    // Not JSON
  }
  return new Error(`Erreur worker ${action} (${status})`);
}

function connectionError(action: string, err: unknown): Error {
  const msg = err instanceof Error ? err.message : "";
  if (
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND")
  ) {
    return new Error(
      "Impossible de joindre la VM GPU. Vérifiez qu'elle est démarrée et que le tunnel est actif."
    );
  }
  return err instanceof Error ? err : new Error("Erreur inconnue");
}

export async function workerHealth() {
  try {
    const res = await fetch(`${workerUrl()}/health`, {
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
    const res = await fetch(`${workerUrl()}/generate`, {
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
    const res = await fetch(`${workerUrl()}/status/${jobId}`, {
      headers: workerHeaders(),
    });
    return await safeResponseJson(res, "status");
  } catch (err) {
    throw connectionError("status", err);
  }
}

export async function listJobs() {
  try {
    const res = await fetch(`${workerUrl()}/jobs`, {
      headers: workerHeaders(),
    });
    return await safeResponseJson(res, "jobs");
  } catch (err) {
    throw connectionError("jobs", err);
  }
}

export async function downloadVideo(jobId: string) {
  try {
    const res = await fetch(`${workerUrl()}/download/${jobId}`, {
      headers: workerHeaders(),
    });
    if (!res.ok) {
      const body = await res.text();
      if (isOfflineError(res.status, body)) {
        throw new Error("La VM GPU est éteinte ou le tunnel est inactif.");
      }
      throw workerError("download", res.status, body);
    }
    // Check content-type to detect ngrok HTML on 200
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) {
      throw new Error("La VM GPU est éteinte ou le tunnel est inactif.");
    }
    return res;
  } catch (err) {
    throw connectionError("download", err);
  }
}

export async function listAvatars() {
  try {
    const res = await fetch(`${workerUrl()}/avatars`, {
      headers: workerHeaders(),
    });
    return await safeResponseJson(res, "avatars");
  } catch (err) {
    throw connectionError("avatars", err);
  }
}
