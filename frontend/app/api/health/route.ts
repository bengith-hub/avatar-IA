import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkEnvStatus } from "@/lib/env";

interface ServiceStatus {
  name: string;
  status: "ok" | "error" | "not_configured";
  message: string;
  latency?: number;
}

async function checkService(
  name: string,
  fn: () => Promise<void>
): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await fn();
    return {
      name,
      status: "ok",
      message: "Connecté",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name,
      status: "error",
      message: error instanceof Error ? error.message : "Erreur inconnue",
      latency: Date.now() - start,
    };
  }
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const envStatus = checkEnvStatus();
  const services: ServiceStatus[] = [];

  // Check Vast.ai
  if (envStatus.vast.configured) {
    services.push(
      await checkService("Vast.ai", async () => {
        const res = await fetch(
          `https://console.vast.ai/api/v0/instances/${process.env.VAST_INSTANCE_ID}/`,
          {
            headers: { Authorization: `Bearer ${process.env.VAST_API_KEY}` },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      })
    );
  } else {
    services.push({ name: "Vast.ai", status: "not_configured", message: "VAST_API_KEY ou VAST_INSTANCE_ID manquant" });
  }

  // Check GPU Worker
  if (envStatus.worker.configured) {
    services.push(
      await checkService("Worker GPU", async () => {
        const url = process.env.GPU_WORKER_URL!.replace(/\/$/, "");
        const res = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.status !== "ok") throw new Error(`Worker status: ${data.status}`);
      })
    );
  } else {
    services.push({ name: "Worker GPU", status: "not_configured", message: "GPU_WORKER_URL ou GPU_WORKER_TOKEN manquant" });
  }

  // Check Pexels
  if (envStatus.pexels.configured) {
    services.push(
      await checkService("Pexels", async () => {
        const res = await fetch(
          "https://api.pexels.com/v1/search?query=test&per_page=1",
          {
            headers: { Authorization: process.env.PEXELS_API_KEY! },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      })
    );
  } else {
    services.push({ name: "Pexels", status: "not_configured", message: "PEXELS_API_KEY manquant" });
  }

  // Check Anthropic
  if (envStatus.anthropic.configured) {
    services.push(
      await checkService("Anthropic", async () => {
        // Just verify the key format, don't make an actual API call
        const key = process.env.ANTHROPIC_API_KEY!;
        if (!key.startsWith("sk-ant-")) throw new Error("Format de clé invalide (doit commencer par sk-ant-)");
      })
    );
  } else {
    services.push({ name: "Anthropic", status: "not_configured", message: "ANTHROPIC_API_KEY manquant" });
  }

  // Check Astria
  if (envStatus.astria.configured) {
    services.push({ name: "Astria", status: "ok", message: "API key et tune ID configurés" });
  } else {
    services.push({ name: "Astria", status: "not_configured", message: "ASTRIA_API_KEY ou ASTRIA_TUNE_ID manquant (optionnel)" });
  }

  // Check Canva
  if (envStatus.canva.configured) {
    services.push({ name: "Canva", status: "ok", message: "Token configuré" });
  } else {
    services.push({ name: "Canva", status: "not_configured", message: "CANVA_ACCESS_TOKEN manquant (optionnel)" });
  }

  // Check R2
  if (envStatus.r2.configured) {
    services.push({ name: "Cloudflare R2", status: "ok", message: "Credentials configurés" });
  } else {
    services.push({ name: "Cloudflare R2", status: "not_configured", message: "R2_* manquant (optionnel)" });
  }

  const allRequired = services.filter((s) =>
    ["Vast.ai", "Worker GPU", "Pexels", "Anthropic"].includes(s.name)
  );
  const allOk = allRequired.every((s) => s.status === "ok");

  return NextResponse.json({
    status: allOk ? "ready" : "incomplete",
    services,
    env: Object.fromEntries(
      Object.entries(envStatus).map(([k, v]) => [k, v.configured])
    ),
  });
}
