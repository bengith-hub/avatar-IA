import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const PREFIX = "voice-samples/";

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY;
  const secretKey = process.env.R2_SECRET_KEY;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error("R2 credentials not configured");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
}

function bucket(): string {
  return process.env.R2_BUCKET ?? "avatar-videos";
}

function publicUrl(key: string): string {
  const accountId = process.env.R2_ACCOUNT_ID;
  return `https://${bucket()}.${accountId}.r2.dev/${key}`;
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    // Try worker first
    const workerUrl = process.env.GPU_WORKER_URL?.replace(/\/$/, "");
    if (workerUrl) {
      try {
        const res = await fetch(`${workerUrl}/voice-samples`, {
          headers: { Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}` },
        });
        if (res.ok) {
          const data = await res.json();
          return NextResponse.json(data);
        }
      } catch {
        // Worker unavailable
      }
    }

    // Fallback: list from R2
    const client = getR2Client();
    const response = await client.send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: PREFIX })
    );

    const samples = (response.Contents ?? [])
      .filter((obj) => obj.Key && !obj.Key.endsWith("/"))
      .map((obj) => {
        const key = obj.Key!;
        const filename = key.replace(PREFIX, "");
        return {
          name: filename,
          url: publicUrl(key),
          size: obj.Size ?? 0,
          uploadedAt: obj.LastModified?.toISOString() ?? "",
          source: "r2",
        };
      });

    return NextResponse.json(samples);
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
      return NextResponse.json({ error: "Fichier audio requis" }, { status: 400 });
    }

    const fileName = file instanceof File ? file.name : "voice-sample.wav";

    // Validate audio type
    const validTypes = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/flac", "audio/x-wav", "audio/wave", "audio/webm"];
    if (!validTypes.some((t) => file.type.startsWith(t.split("/")[0]))) {
      return NextResponse.json(
        { error: "Format audio non supporté. Utilisez WAV, MP3, OGG, FLAC ou WebM." },
        { status: 400 }
      );
    }

    // Try worker first
    const workerUrl = process.env.GPU_WORKER_URL?.replace(/\/$/, "");
    if (workerUrl) {
      try {
        const workerForm = new FormData();
        workerForm.append("file", file);
        const res = await fetch(`${workerUrl}/voice-samples`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}` },
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
    const key = `${PREFIX}${fileName}`;

    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    return NextResponse.json({
      name: fileName,
      url: publicUrl(key),
      source: "r2",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    if (message.includes("R2 credentials not configured")) {
      return NextResponse.json(
        { error: "VM GPU non démarrée et R2 non configuré. Configurez au moins un des deux." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { name } = await req.json();
    if (!name) {
      return NextResponse.json({ error: "Nom du fichier requis" }, { status: 400 });
    }

    const client = getR2Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: `${PREFIX}${name}`,
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
