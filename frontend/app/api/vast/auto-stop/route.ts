import { NextResponse } from "next/server";
import { getInstanceStatus, stopInstance } from "@/lib/vast-api";
import { workerHealth } from "@/lib/gpu-api";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const instance = await getInstanceStatus();
    const status = instance.actual_status ?? instance.cur_state;

    if (status !== "running") {
      return NextResponse.json({
        action: "none",
        reason: "VM is not running",
        status,
      });
    }

    let shouldStop = false;
    let reason = "";

    try {
      const health = await workerHealth();

      if (health.active_jobs > 0) {
        return NextResponse.json({
          action: "none",
          reason: `${health.active_jobs} active job(s), skipping auto-stop`,
        });
      }

      if (health.last_activity) {
        const lastActivity = new Date(health.last_activity).getTime();
        const idleMs = Date.now() - lastActivity;
        if (idleMs >= IDLE_TIMEOUT_MS) {
          shouldStop = true;
          reason = `Idle for ${Math.round(idleMs / 60000)} minutes (threshold: 30 min)`;
        } else {
          reason = `Last activity ${Math.round(idleMs / 60000)} min ago, under threshold`;
        }
      } else {
        const uptimeMs = health.uptime * 1000;
        if (uptimeMs >= IDLE_TIMEOUT_MS) {
          shouldStop = true;
          reason = `No activity since boot, uptime ${Math.round(uptimeMs / 60000)} min`;
        } else {
          reason = `No activity yet but uptime only ${Math.round(uptimeMs / 60000)} min`;
        }
      }
    } catch {
      reason = "Worker unreachable but VM is running, stopping to avoid waste";
      shouldStop = true;
    }

    if (shouldStop) {
      await stopInstance();
      return NextResponse.json({ action: "stopped", reason });
    }

    return NextResponse.json({ action: "none", reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
