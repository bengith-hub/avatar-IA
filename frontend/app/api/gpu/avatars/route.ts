import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAvatars, resolveWorkerUrl } from "@/lib/gpu-api";
import { uploadToR2, listR2Avatars } from "@/lib/r2-avatars";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    // Try GPU worker first, fall back to R2-stored avatars
    let workerAvatars: { id: string; name: string; type: string; source: string }[] = [];
    try {
      const result = await listAvatars();
      workerAvatars = (Array.isArray(result) ? result : []).map((a: { id: string; name: string; type: string }) => ({
        ...a,
        source: "worker",
      }));
    } catch {
      // Worker unavailable, that's fine
    }

    // Also get R2-stored avatars
    let r2Avatars: { id: string; name: string; type: string; source: string; url: string }[] = [];
    try {
      r2Avatars = await listR2Avatars();
    } catch {
      // R2 not configured, that's fine
    }

    return NextResponse.json([...workerAvatars, ...r2Avatars]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    // Try GPU worker first
    let workerUrl: string | null = null;
    try { workerUrl = await resolveWorkerUrl(); } catch { /* unavailable */ }
    if (workerUrl) {
      try {
        const workerForm = new FormData();
        workerForm.append("file", file);

        const res = await fetch(`${workerUrl}/avatars`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}`,
            "ngrok-skip-browser-warning": "true",
          },
          body: workerForm,
        });

        if (res.ok) {
          const result = await res.json();
          return NextResponse.json(result);
        }
      } catch {
        // Worker unavailable, fall through to R2
      }
    }

    // Fallback: store on R2
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file instanceof File ? file.name : "avatar.png";
    const result = await uploadToR2(buffer, fileName, file.type);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";

    if (
      message.includes("fetch failed") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ETIMEDOUT") ||
      message.includes("is not set")
    ) {
      return NextResponse.json(
        { error: "VM GPU non démarrée et R2 non configuré. Démarrez la VM ou configurez R2 pour stocker les photos." },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
