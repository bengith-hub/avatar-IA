"use client";

import { useState, useEffect, useCallback } from "react";
import { Power, PowerOff, RefreshCw, Cpu } from "lucide-react";

interface VmStatus {
  instance: {
    id: number;
    status: string;
    gpu_name: string | null;
    gpu_ram: number | null;
    cost_per_hour: number | null;
    start_date: string | null;
  };
  billing: {
    balance: number | null;
    total_spent: number | null;
  };
}

const GpuStatusCard = () => {
  const [status, setStatus] = useState<VmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/vast/status");
      if (!res.ok) throw new Error("Impossible de récupérer le statut");
      const data = await res.json();
      setStatus(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleAction = async (action: "start" | "stop") => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/vast/${action}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Échec ${action}`);
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  const vmStatus = status?.instance?.status ?? "unknown";
  const isRunning = vmStatus === "running";
  const isStopped = vmStatus === "stopped" || vmStatus === "exited";

  const statusColor = isRunning
    ? "text-green-400"
    : isStopped
      ? "text-zinc-500"
      : "text-yellow-400";

  const statusLabel = isRunning
    ? "Active"
    : isStopped
      ? "Éteinte"
      : vmStatus === "loading"
        ? "Démarrage..."
        : vmStatus;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold">VM GPU</h2>
        </div>
        <button
          onClick={fetchStatus}
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-zinc-500">Statut</p>
          <p className={`font-medium ${statusColor}`}>{statusLabel}</p>
        </div>
        <div>
          <p className="text-zinc-500">GPU</p>
          <p className="font-medium">
            {status?.instance?.gpu_name ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500">Coût/heure</p>
          <p className="font-medium">
            {status?.instance?.cost_per_hour != null
              ? `$${status.instance.cost_per_hour.toFixed(3)}/h`
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500">Solde Vast.ai</p>
          <p className="font-medium">
            {status?.billing?.balance != null
              ? `$${status.billing.balance.toFixed(2)}`
              : "—"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("start")}
          disabled={actionLoading || isRunning}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-40"
        >
          <Power className="h-4 w-4" />
          Démarrer
        </button>
        <button
          onClick={() => handleAction("stop")}
          disabled={actionLoading || isStopped}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-40"
        >
          <PowerOff className="h-4 w-4" />
          Arrêter
        </button>
      </div>
    </div>
  );
};

export default GpuStatusCard;
