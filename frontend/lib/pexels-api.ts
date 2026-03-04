const PEXELS_BASE = "https://api.pexels.com";

function pexelsHeaders(): HeadersInit {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY is not set");
  return { Authorization: key };
}

export async function searchPhotos(query: string, page = 1, perPage = 12) {
  const params = new URLSearchParams({
    query,
    page: String(page),
    per_page: String(perPage),
  });
  const res = await fetch(`${PEXELS_BASE}/v1/search?${params}`, {
    headers: pexelsHeaders(),
  });
  if (!res.ok) throw new Error(`Pexels search failed (${res.status})`);
  return res.json();
}

export async function searchVideos(query: string, page = 1, perPage = 12) {
  const params = new URLSearchParams({
    query,
    page: String(page),
    per_page: String(perPage),
  });
  const res = await fetch(`${PEXELS_BASE}/videos/search?${params}`, {
    headers: pexelsHeaders(),
  });
  if (!res.ok) throw new Error(`Pexels video search failed (${res.status})`);
  return res.json();
}
