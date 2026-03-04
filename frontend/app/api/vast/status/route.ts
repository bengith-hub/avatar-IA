import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInstanceStatus, getBilling } from "@/lib/vast-api";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const [instance, billing] = await Promise.all([
      getInstanceStatus(),
      getBilling(),
    ]);

    return NextResponse.json({
      instance: {
        id: instance.id,
        status: instance.actual_status ?? instance.intended_status ?? "unknown",
        gpu_name: instance.gpu_name ?? null,
        gpu_ram: instance.gpu_ram ?? null,
        cpu_ram: instance.cpu_ram ?? null,
        cost_per_hour: instance.dph_total ?? null,
        start_date: instance.start_date ?? null,
      },
      billing: {
        balance: billing.balance ?? null,
        total_spent: billing.total_spent ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
