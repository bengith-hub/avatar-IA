import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateVideo } from "@/lib/gpu-api";

async function syncR2AvatarToWorker(avatarId: string): Promise<string> {
  const { S3Client, GetObjectCommand, ListObjectsV2Command } = await import(
    "@aws-sdk/client-s3"
  );

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY;
  const secretKey = process.env.R2_SECRET_KEY;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error("R2 non configuré — impossible de synchroniser l'avatar");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  const bucket = process.env.R2_BUCKET ?? "avatar-videos";

  const listRes = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: `avatars/${avatarId}` })
  );

  const obj = listRes.Contents?.find((o) => o.Key && !o.Key.endsWith("/"));
  if (!obj?.Key) {
    throw new Error(`Avatar '${avatarId}' introuvable sur R2`);
  }

  const getRes = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: obj.Key })
  );
  if (!getRes.Body) {
    throw new Error("Fichier avatar vide sur R2");
  }

  const bytes = await getRes.Body.transformToByteArray();
  const ext = obj.Key.split(".").pop() ?? "png";
  const filename = `${avatarId}.${ext}`;

  const workerUrl = process.env.GPU_WORKER_URL!.replace(/\/$/, "");
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(bytes)]), filename);

  const uploadRes = await fetch(`${workerUrl}/avatars`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}`,
      "ngrok-skip-browser-warning": "true",
      "User-Agent": "AvatarIA-Worker/1.0",
    },
    body: form,
  });

  const uploadBody = await uploadRes.text();
  if (
    !uploadRes.ok ||
    uploadBody.includes("<!doctype") ||
    uploadBody.includes("<!DOCTYPE")
  ) {
    throw new Error(
      `Impossible de joindre la VM GPU (${uploadRes.status}). Vérifiez que le tunnel est actif.`
    );
  }

  const result = JSON.parse(uploadBody);
  return result.id as string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // If avatar is stored on R2, sync it to the worker first
    if (typeof body.avatar_id === "string" && body.avatar_id.startsWith("r2-")) {
      body.avatar_id = await syncR2AvatarToWorker(body.avatar_id);
    }

    const result = await generateVideo(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
