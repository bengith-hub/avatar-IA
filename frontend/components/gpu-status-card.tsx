"use client";

import { useState, useEffect, useCallback } from "react";
import { Power, PowerOff, RefreshCw, Cpu, Timer, AlertTriangle, Wifi, WifiOff } from "lucide-react";

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

const AUTO_STOP_OPTIONS = [
  { value: 0, label: "Désactivé" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 heure" },
  { value: 120, label: "2 heures" },
];

const BUDGET_ALERT_THRESHOLD = 5; // Alert when balance < $5

const GpuStatusCard = () => {
  const [status, setStatus] = useState<VmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoStopMinutes, setAutoStopMinutes] = useState(30);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [workerStatus, setWorkerStatus] = useState<{
    tested: boolean;
    connected: boolean;
    loading: boolean;
    detail: string;
  }>({ tested: false, connected: false, loading: false, detail: "" });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/vast/status");
      if (!res.ok) throw new Error("Impossible de récupérer le statut");
      const data = await res.json();
      setStatus(data);
      setError("");

      // Track when VM started running
      if (data.instance?.status === "running" && !startedAt) {
        setStartedAt(Date.now());
      } else if (data.instance?.status !== "running") {
        setStartedAt(null);
      }
      // Clear success message once status reflects the change
      if (successMessage) setSuccessMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [startedAt, successMessage]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Auto-stop logic
  useEffect(() => {
    if (autoStopMinutes === 0 || !startedAt) return;

    const checkAutoStop = async () => {
      const elapsed = (Date.now() - startedAt) / 1000 / 60;
      if (elapsed >= autoStopMinutes) {
        try {
          await fetch("/api/vast/stop", { method: "POST" });
          setStartedAt(null);
        } catch {
          // Will retry on next interval
        }
      }
    };

    const interval = setInterval(checkAutoStop, 30_000);
    return () => clearInterval(interval);
  }, [autoStopMinutes, startedAt]);

  const handleAction = async (action: "start" | "stop") => {
    setActionLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const res = await fetch(`/api/vast/${action}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Échec ${action}`);
      }
      if (action === "start") {
        setStartedAt(Date.now());
        setSuccessMessage("Démarrage demandé — la VM s'allume...");
      }
      if (action === "stop") {
        setStartedAt(null);
        setSuccessMessage("Arrêt demandé — la VM s'éteint...");
      }
      // Wait a bit before refreshing so Vast.ai has time to update
      setTimeout(() => fetchStatus(), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  const testWorkerConnection = async () => {
    setWorkerStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/gpu/health");
      const data = await res.json();
      if (data.connected) {
        const gpu = data.gpu_name ?? "GPU";
        const mem = data.gpu_memory ? ` — ${data.gpu_memory}` : "";
        setWorkerStatus({
          tested: true,
          connected: true,
          loading: false,
          detail: `Connecté : ${gpu}${mem}`,
        });
      } else {
        setWorkerStatus({
          tested: true,
          connected: false,
          loading: false,
          detail: data.error ?? "Worker injoignable",
        });
      }
    } catch {
      setWorkerStatus({
        tested: true,
        connected: false,
        loading: false,
        detail: "Erreur réseau lors du test",
      });
    }
  };

  const vmStatus = status?.instance?.status ?? "unknown";
  const isRunning = vmStatus === "running";
  const isStopped = vmStatus === "stopped" || vmStatus === "exited";
  const lowBalance =
    status?.billing?.balance != null &&
    status.billing.balance < BUDGET_ALERT_THRESHOLD;

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

  // Session cost estimation
  const sessionCost =
    isRunning && startedAt && status?.instance?.cost_per_hour
      ? ((Date.now() - startedAt) / 1000 / 3600) * status.instance.cost_per_hour
      : null;

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

      {successMessage && (
        <p className="mb-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
          {successMessage}
        </p>
      )}

      {lowBalance && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Solde bas — pensez à recharger votre compte Vast.ai
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
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
          <p className={`font-medium ${lowBalance ? "text-amber-400" : ""}`}>
            {status?.billing?.balance != null
              ? `$${status.billing.balance.toFixed(2)}`
              : "—"}
          </p>
        </div>
        {sessionCost != null && (
          <div>
            <p className="text-zinc-500">Coût session</p>
            <p className="font-medium text-blue-400">
              ~${sessionCost.toFixed(3)}
            </p>
          </div>
        )}
      </div>

      {/* Auto-stop selector */}
      <div className="mb-4 flex items-center gap-3 rounded-lg bg-zinc-800/50 px-3 py-2">
        <Timer className="h-4 w-4 text-zinc-500" />
        <span className="text-xs text-zinc-400">Auto-stop :</span>
        <select
          value={autoStopMinutes}
          onChange={(e) => setAutoStopMinutes(Number(e.target.value))}
          className="rounded bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
        >
          {AUTO_STOP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Worker connection test */}
      {isRunning && (
        <div className="mb-4">
          <button
            onClick={testWorkerConnection}
            disabled={workerStatus.loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {workerStatus.loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : workerStatus.tested && workerStatus.connected ? (
              <Wifi className="h-4 w-4 text-green-400" />
            ) : workerStatus.tested ? (
              <WifiOff className="h-4 w-4 text-red-400" />
            ) : (
              <Wifi className="h-4 w-4" />
            )}
            Tester la connexion Worker
          </button>
          {workerStatus.tested && (
            <p
              className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                workerStatus.connected
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {workerStatus.detail}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => handleAction("start")}
          disabled={actionLoading || isRunning}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-40"
        >
          {actionLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          Démarrer
        </button>
        <button
          onClick={() => handleAction("stop")}
          disabled={actionLoading || isStopped}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-40"
        >
          {actionLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <PowerOff className="h-4 w-4" />
          )}
          Arrêter
        </button>
      </div>
    </div>
  );
};

export default GpuStatusCard;
