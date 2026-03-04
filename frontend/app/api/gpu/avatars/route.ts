import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAvatars } from "@/lib/gpu-api";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await listAvatars();
    return NextResponse.json(result);
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

    const workerUrl = process.env.GPU_WORKER_URL?.replace(/\/$/, "");
    if (!workerUrl) throw new Error("GPU_WORKER_URL is not set");

    const workerForm = new FormData();
    workerForm.append("file", file);

    const res = await fetch(`${workerUrl}/avatars`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}`,
      },
      body: workerForm,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Worker upload failed (${res.status}): ${text}`);
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
