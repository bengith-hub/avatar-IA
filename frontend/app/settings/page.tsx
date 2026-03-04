"use client";

import { useState, useEffect } from "react";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
} from "lucide-react";

interface ServiceStatus {
  name: string;
  status: "ok" | "error" | "not_configured";
  message: string;
  latency?: number;
}

interface HealthData {
  status: string;
  services: ServiceStatus[];
  env: Record<string, boolean>;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const statusIcon = (status: string) => {
    switch (status) {
      case "ok":
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-400" />;
      default:
        return <AlertCircle className="h-5 w-5 text-zinc-500" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return "bg-green-500/10 text-green-400";
      case "error":
        return "bg-red-500/10 text-red-400";
      default:
        return "bg-zinc-500/10 text-zinc-400";
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Connexions & Services</h1>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Tester
        </button>
      </div>

      {/* Global status */}
      {health && (
        <div
          className={`mb-6 flex items-center gap-3 rounded-xl border p-4 ${
            health.status === "ready"
              ? "border-green-500/30 bg-green-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <Zap
            className={`h-5 w-5 ${
              health.status === "ready" ? "text-green-400" : "text-amber-400"
            }`}
          />
          <div>
            <p className="text-sm font-medium text-white">
              {health.status === "ready"
                ? "Tous les services requis sont connectés"
                : "Configuration incomplète — certains services ne sont pas connectés"}
            </p>
            <p className="text-xs text-zinc-400">
              Configurez les variables d&apos;environnement dans Vercel pour activer les services
            </p>
          </div>
        </div>
      )}

      {/* Services list */}
      <div className="flex flex-col gap-3">
        {health?.services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="flex items-center gap-3">
              {statusIcon(service.status)}
              <div>
                <p className="text-sm font-medium text-white">{service.name}</p>
                <p className="text-xs text-zinc-500">{service.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {service.latency != null && (
                <span className="text-xs text-zinc-500">{service.latency}ms</span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(service.status)}`}
              >
                {service.status === "ok"
                  ? "OK"
                  : service.status === "error"
                    ? "Erreur"
                    : "Non configuré"}
              </span>
            </div>
          </div>
        ))}

        {loading && !health && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-zinc-500" />
            <p className="text-sm text-zinc-500">Test des connexions en cours...</p>
          </div>
        )}
      </div>

      {/* Env vars reference */}
      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Variables d&apos;environnement</h2>
        <p className="mb-4 text-sm text-zinc-400">
          À configurer dans Vercel &rarr; Settings &rarr; Environment Variables
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-2 pr-4">Variable</th>
                <th className="pb-2 pr-4">Service</th>
                <th className="pb-2 pr-4">Requis</th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {[
                { var: "AUTH_SECRET", service: "Auth", required: true, group: "auth" },
                { var: "AUTH_USERNAME", service: "Auth", required: true, group: "auth" },
                { var: "AUTH_PASSWORD_HASH", service: "Auth", required: true, group: "auth" },
                { var: "VAST_API_KEY", service: "Vast.ai", required: true, group: "vast" },
                { var: "VAST_INSTANCE_ID", service: "Vast.ai", required: true, group: "vast" },
                { var: "GPU_WORKER_URL", service: "Worker", required: true, group: "worker" },
                { var: "GPU_WORKER_TOKEN", service: "Worker", required: true, group: "worker" },
                { var: "PEXELS_API_KEY", service: "Pexels", required: true, group: "pexels" },
                { var: "ANTHROPIC_API_KEY", service: "Anthropic", required: true, group: "anthropic" },
                { var: "ASTRIA_API_KEY", service: "Astria", required: false, group: "astria" },
                { var: "ASTRIA_TUNE_ID", service: "Astria", required: false, group: "astria" },
                { var: "CANVA_ACCESS_TOKEN", service: "Canva", required: false, group: "canva" },
                { var: "R2_ACCOUNT_ID", service: "R2", required: false, group: "r2" },
                { var: "R2_ACCESS_KEY", service: "R2", required: false, group: "r2" },
                { var: "R2_SECRET_KEY", service: "R2", required: false, group: "r2" },
              ].map((row) => (
                <tr key={row.var} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">{row.var}</td>
                  <td className="py-2 pr-4">{row.service}</td>
                  <td className="py-2 pr-4">
                    {row.required ? (
                      <span className="text-amber-400">Oui</span>
                    ) : (
                      <span className="text-zinc-500">Non</span>
                    )}
                  </td>
                  <td className="py-2">
                    {health?.env[row.group] ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-zinc-600" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
