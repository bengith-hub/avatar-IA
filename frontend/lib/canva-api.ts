const CANVA_BASE = "https://api.canva.com/rest/v1";

function canvaHeaders(): HeadersInit {
  const token = process.env.CANVA_ACCESS_TOKEN;
  if (!token) throw new Error("CANVA_ACCESS_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function uploadAsset(
  videoBuffer: ArrayBuffer,
  filename: string
): Promise<{ asset_id: string }> {
  const formData = new FormData();
  formData.append("file", new Blob([videoBuffer], { type: "video/mp4" }), filename);

  const res = await fetch(`${CANVA_BASE}/assets/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CANVA_ACCESS_TOKEN}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { asset_id: data.asset?.id ?? data.id };
}

export async function createDesign(assetId: string): Promise<{ design_url: string }> {
  const res = await fetch(`${CANVA_BASE}/designs`, {
    method: "POST",
    headers: canvaHeaders(),
    body: JSON.stringify({
      design_type: "video",
      title: `Avatar IA - ${new Date().toISOString().slice(0, 10)}`,
      asset_id: assetId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva create design failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { design_url: data.design?.url ?? data.urls?.edit_url ?? "" };
}
