const ASTRIA_BASE = "https://api.astria.ai";

function apiKey(): string {
  const key = process.env.ASTRIA_API_KEY;
  if (!key) throw new Error("ASTRIA_API_KEY is not set");
  return key;
}

function tuneId(): string {
  const id = process.env.ASTRIA_TUNE_ID;
  if (!id) throw new Error("ASTRIA_TUNE_ID is not set");
  return id;
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

export interface AstriaPrompt {
  id: number;
  text: string;
  images: string[];
  status: string;
  created_at: string;
}

export async function generateAstriaImages(
  text: string,
  numImages: number = 4
): Promise<AstriaPrompt> {
  const res = await fetch(`${ASTRIA_BASE}/tunes/${tuneId()}/prompts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      prompt: {
        text,
        num_images: numImages,
        super_resolution: false,
        face_correct: true,
        face_swap: true,
        callback: `${process.env.NEXTAUTH_URL || ""}/api/astria/callback`,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Astria API failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function getAstriaPrompt(promptId: number): Promise<AstriaPrompt> {
  const res = await fetch(`${ASTRIA_BASE}/tunes/${tuneId()}/prompts/${promptId}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Astria prompt status failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function listAstriaPrompts(): Promise<AstriaPrompt[]> {
  const res = await fetch(`${ASTRIA_BASE}/tunes/${tuneId()}/prompts`, {
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Astria list prompts failed (${res.status}): ${text}`);
  }

  return res.json();
}
