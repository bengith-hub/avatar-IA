"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Play } from "lucide-react";
import AvatarSelector from "@/components/avatar-selector";
import BackgroundPicker from "@/components/background-picker";
import ScriptAssistant from "@/components/script-assistant";
import VideoPlayer from "@/components/video-player";
import CanvaLauncher from "@/components/canva-launcher";

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

const EMOTIONS = [
  { id: "neutral", label: "Neutre" },
  { id: "enthusiastic", label: "Enthousiaste" },
  { id: "serious", label: "Sérieux" },
  { id: "friendly", label: "Amical" },
];

const FORMATS = [
  { id: "16:9", label: "16:9 (paysage)" },
  { id: "9:16", label: "9:16 (portrait)" },
];

interface JobStatus {
  job_id: string;
  status: string;
  progress: number | null;
  error: string | null;
}

const SceneGenerator = () => {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("fr");
  const [avatarId, setAvatarId] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [emotion, setEmotion] = useState("neutral");
  const [format, setFormat] = useState("16:9");

  const [avatars, setAvatars] = useState<{ id: string; name: string; url?: string }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadAvatars = async () => {
      try {
        const res = await fetch("/api/gpu/avatars");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setAvatars(data.map((a: { id: string; name: string; url?: string }) => ({
              id: a.id,
              name: a.name,
              url: a.url,
            })));
            return;
          }
        }
      } catch {
        // Worker not available, use defaults
      }
      setAvatars([
        { id: "benjamin-buste", name: "Benjamin Buste" },
        { id: "benjamin-pied", name: "Benjamin Pied" },
        { id: "benjamin-assis", name: "Benjamin Assis" },
      ]);
    };
    loadAvatars();
  }, []);

  const pollStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/gpu/status?job_id=${id}`);
      if (!res.ok) return;
      const data: JobStatus = await res.json();
      setJobStatus(data);

      if (data.status === "completed" || data.status === "failed") {
        setGenerating(false);
        if (data.status === "failed") {
          setError(data.error ?? "La génération a échoué");
        }
        return;
      }

      setTimeout(() => pollStatus(id), 5000);
    } catch {
      setTimeout(() => pollStatus(id), 5000);
    }
  }, []);

  const handleGenerate = async () => {
    if (!text.trim() || !avatarId) return;
    setError("");
    setGenerating(true);
    setJobStatus(null);
    setJobId(null);

    try {
      const res = await fetch("/api/gpu/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          language,
          avatar_id: avatarId,
          background_url: backgroundUrl || undefined,
          emotion,
          format,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur lors du lancement");
      }

      const data = await res.json();
      setJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setGenerating(false);
    }
  };

  const isCompleted = jobStatus?.status === "completed";
  const progress = jobStatus?.progress ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Script assistant */}
      <ScriptAssistant onInsert={(script) => setText(script)} />

      {/* Text input */}
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          Texte à dire
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tapez le texte que l'avatar doit prononcer..."
          rows={4}
          className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
        />
        <p className="mt-1 text-xs text-zinc-500">{text.length} / 5000 caractères</p>
      </div>

      {/* Language + Emotion + Format */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">Langue</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">Émotion</label>
          <select
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
          >
            {EMOTIONS.map((em) => (
              <option key={em.id} value={em.id}>{em.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Avatar selector */}
      <AvatarSelector avatars={avatars} value={avatarId} onChange={setAvatarId} />

      {/* Background picker */}
      <BackgroundPicker value={backgroundUrl} onChange={setBackgroundUrl} />

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating || !text.trim() || !avatarId}
        className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {generating ? "Génération en cours..." : "Générer la vidéo"}
      </button>

      {/* Error */}
      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
      )}

      {/* Progress bar */}
      {generating && jobId && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-zinc-400">
              {jobStatus?.status === "processing" ? "Génération en cours..." : "En attente..."}
            </span>
            <span className="font-medium text-white">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Result */}
      {isCompleted && jobId && (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">Résultat</h3>
          <VideoPlayer
            src={`/api/gpu/download?job_id=${jobId}`}
            jobId={jobId}
          />
          <CanvaLauncher jobId={jobId} />
        </div>
      )}
    </div>
  );
};

export default SceneGenerator;
