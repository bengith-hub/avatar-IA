function workerUrl(): string {
  const url = process.env.GPU_WORKER_URL;
  if (!url) throw new Error("GPU_WORKER_URL is not set");
  return url.replace(/\/$/, "");
}

function workerHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function workerHealth() {
  const res = await fetch(`${workerUrl()}/health`);
  if (!res.ok) throw new Error(`Worker health failed (${res.status})`);
  return res.json();
}

export async function generateVideo(body: {
  text: string;
  language: string;
  avatar_id: string;
  background_url?: string;
  emotion?: string;
  format?: string;
}) {
  const res = await fetch(`${workerUrl()}/generate`, {
    method: "POST",
    headers: workerHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker generate failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function getJobStatus(jobId: string) {
  const res = await fetch(`${workerUrl()}/status/${jobId}`, {
    headers: workerHeaders(),
  });
  if (!res.ok) throw new Error(`Worker status failed (${res.status})`);
  return res.json();
}

export async function listJobs() {
  const res = await fetch(`${workerUrl()}/jobs`, {
    headers: workerHeaders(),
  });
  if (!res.ok) throw new Error(`Worker jobs failed (${res.status})`);
  return res.json();
}

export async function downloadVideo(jobId: string) {
  const res = await fetch(`${workerUrl()}/download/${jobId}`, {
    headers: workerHeaders(),
  });
  if (!res.ok) throw new Error(`Worker download failed (${res.status})`);
  return res;
}

export async function listAvatars() {
  const res = await fetch(`${workerUrl()}/avatars`, {
    headers: workerHeaders(),
  });
  if (!res.ok) throw new Error(`Worker avatars failed (${res.status})`);
  return res.json();
}
