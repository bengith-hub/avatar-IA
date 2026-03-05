import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateVideo } from "@/lib/gpu-api";

function getR2Client() {
  const { S3Client } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY;
  const secretKey = process.env.R2_SECRET_KEY;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error("R2 non configuré");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
}

function r2Bucket(): string {
  return process.env.R2_BUCKET ?? "avatar-videos";
}

async function fetchR2AvatarBase64(avatarId: string): Promise<{
  base64: string;
  filename: string;
}> {
  const { GetObjectCommand, ListObjectsV2Command } = await import(
    "@aws-sdk/client-s3"
  );

  const client = getR2Client();

  const listRes = await client.send(
    new ListObjectsV2Command({ Bucket: r2Bucket(), Prefix: `avatars/${avatarId}` })
  );

  const obj = listRes.Contents?.find((o) => o.Key && !o.Key.endsWith("/"));
  if (!obj?.Key) {
    throw new Error(`Avatar '${avatarId}' introuvable sur R2`);
  }

  const getRes = await client.send(
    new GetObjectCommand({ Bucket: r2Bucket(), Key: obj.Key })
  );
  if (!getRes.Body) {
    throw new Error("Fichier avatar vide sur R2");
  }

  const bytes = await getRes.Body.transformToByteArray();
  const ext = obj.Key.split(".").pop() ?? "png";

  return {
    base64: Buffer.from(bytes).toString("base64"),
    filename: `${avatarId}.${ext}`,
  };
}

async function fetchR2VoiceSampleBase64(): Promise<{
  base64: string;
  filename: string;
} | null> {
  const { GetObjectCommand, ListObjectsV2Command } = await import(
    "@aws-sdk/client-s3"
  );

  try {
    const client = getR2Client();

    const listRes = await client.send(
      new ListObjectsV2Command({ Bucket: r2Bucket(), Prefix: "voice-samples/" })
    );

    const obj = listRes.Contents?.find((o) => o.Key && !o.Key.endsWith("/"));
    if (!obj?.Key) return null;

    const getRes = await client.send(
      new GetObjectCommand({ Bucket: r2Bucket(), Key: obj.Key })
    );
    if (!getRes.Body) return null;

    const bytes = await getRes.Body.transformToByteArray();
    const filename = obj.Key.replace("voice-samples/", "");

    return {
      base64: Buffer.from(bytes).toString("base64"),
      filename,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // If avatar is stored on R2, embed the photo in the generate request
    if (typeof body.avatar_id === "string" && body.avatar_id.startsWith("r2-")) {
      const { base64, filename } = await fetchR2AvatarBase64(body.avatar_id);
      body.avatar_photo_base64 = base64;
      body.avatar_photo_filename = filename;
    }

    // Always embed the voice sample from R2 so the worker has it locally
    const voiceSample = await fetchR2VoiceSampleBase64();
    if (voiceSample) {
      body.voice_sample_base64 = voiceSample.base64;
      body.voice_sample_filename = voiceSample.filename;
    }

    const result = await generateVideo(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
