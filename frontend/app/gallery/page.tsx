"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Download, Trash2, ExternalLink, Clock, Globe } from "lucide-react";
import VideoPlayer from "@/components/video-player";

interface Job {
  job_id: string;
  status: string;
  created_at: string;
  text_preview: string;
}

export default function GalleryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gpu/jobs");
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const completedJobs = jobs.filter((j) => j.status === "completed");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Galerie</h1>
        <button
          onClick={fetchJobs}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {completedJobs.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-500">
            {loading ? "Chargement..." : "Aucune vidéo générée pour l'instant."}
          </p>
          {!loading && (
            <a
              href="/generate"
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Créer une vidéo
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {selectedJob && (
            <div className="mb-4">
              <button
                onClick={() => setSelectedJob(null)}
                className="mb-3 text-sm text-zinc-400 hover:text-white"
              >
                &larr; Retour à la liste
              </button>
              <VideoPlayer
                src={`/api/gpu/download?job_id=${selectedJob}`}
                jobId={selectedJob}
              />
            </div>
          )}

          {!selectedJob && (
            <div className="grid gap-3">
              {completedJobs.map((job) => (
                <div
                  key={job.job_id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {job.text_preview}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-green-400">
                        {job.status}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => setSelectedJob(job.job_id)}
                      className="rounded-lg bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    <a
                      href={`/api/gpu/download?job_id=${job.job_id}`}
                      download
                      className="rounded-lg bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
