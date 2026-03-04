import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const PREFIX = "avatars/";

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

export async function uploadToR2(
  data: Buffer | Uint8Array,
  fileName: string,
  contentType: string
): Promise<{ id: string; name: string; type: string; source: string; url: string }> {
  const client = getR2Client();
  const ext = fileName.split(".").pop() ?? "png";
  const id = `r2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const key = `${PREFIX}${id}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  );

  const name = fileName.replace(/\.[^.]+$/, "");

  return {
    id,
    name,
    type: ext,
    source: "r2",
    url: publicUrl(key),
  };
}

export async function listR2Avatars(): Promise<
  { id: string; name: string; type: string; source: string; url: string }[]
> {
  const client = getR2Client();
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket(),
      Prefix: PREFIX,
    })
  );

  return (response.Contents ?? [])
    .filter((obj) => obj.Key && !obj.Key.endsWith("/"))
    .map((obj) => {
      const key = obj.Key!;
      const filename = key.replace(PREFIX, "");
      const ext = filename.split(".").pop() ?? "png";
      const id = filename.replace(/\.[^.]+$/, "");
      return {
        id,
        name: id,
        type: ext,
        source: "r2",
        url: publicUrl(key),
      };
    });
}

export async function deleteR2Avatar(id: string): Promise<void> {
  const client = getR2Client();
  // Find the file by listing with the id prefix
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket(),
      Prefix: `${PREFIX}${id}`,
    })
  );
  for (const obj of response.Contents ?? []) {
    if (obj.Key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket(),
          Key: obj.Key,
        })
      );
    }
  }
}
