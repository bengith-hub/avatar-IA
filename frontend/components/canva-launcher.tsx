"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Check } from "lucide-react";

interface CanvaLauncherProps {
  jobId: string;
}

const CanvaLauncher = ({ jobId }: CanvaLauncherProps) => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [designUrl, setDesignUrl] = useState("");

  const uploadToCanva = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/canva/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!res.ok) throw new Error("Échec de l'upload vers Canva");
      const data = await res.json();
      setDesignUrl(data.design_url ?? "");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  if (done && designUrl) {
    return (
      <a
        href={designUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500"
      >
        <ExternalLink className="h-4 w-4" />
        Ouvrir dans Canva
      </a>
    );
  }

  return (
    <div>
      <button
        onClick={uploadToCanva}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : done ? (
          <Check className="h-4 w-4" />
        ) : (
          <ExternalLink className="h-4 w-4" />
        )}
        {loading ? "Upload en cours..." : "Envoyer vers Canva"}
      </button>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
};

export default CanvaLauncher;
