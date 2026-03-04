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
  };
}

function isOfflineError(status: number, body: string): boolean {
  return (
    body.includes("ERR_NGROK") ||
    body.includes("is offline") ||
    body.includes("tunnel") ||
    body.includes("<!DOCTYPE") ||
    body.includes("<html")
  );
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
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw workerError("health", res.status, body);
    }
    return res.json();
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
    if (!res.ok) {
      const text = await res.text();
      throw workerError("generate", res.status, text);
    }
    return res.json();
  } catch (err) {
    throw connectionError("generate", err);
  }
}

export async function getJobStatus(jobId: string) {
  try {
    const res = await fetch(`${workerUrl()}/status/${jobId}`, {
      headers: workerHeaders(),
    });
    if (!res.ok) {
      const body = await res.text();
      throw workerError("status", res.status, body);
    }
    return res.json();
  } catch (err) {
    throw connectionError("status", err);
  }
}

export async function listJobs() {
  try {
    const res = await fetch(`${workerUrl()}/jobs`, {
      headers: workerHeaders(),
    });
    if (!res.ok) {
      const body = await res.text();
      throw workerError("jobs", res.status, body);
    }
    return res.json();
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
      throw workerError("download", res.status, body);
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
    if (!res.ok) {
      const body = await res.text();
      throw workerError("avatars", res.status, body);
    }
    return res.json();
  } catch (err) {
    throw connectionError("avatars", err);
  }
}
