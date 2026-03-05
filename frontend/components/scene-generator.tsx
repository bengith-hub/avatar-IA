"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Play, Sparkles, FileText, MessageSquare } from "lucide-react";
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

function extractSpokenText(script: string): string {
  const lines: string[] = [];
  const regex = /TEXTE\s*:\s*[«""]([^»""]+)[»""]/g;
  let match;
  while ((match = regex.exec(script)) !== null) {
    lines.push(match[1].trim());
  }
  return lines.length > 0 ? lines.join("\n\n") : script;
}

interface JobStatus {
  job_id: string;
  status: string;
  progress: number | null;
  error: string | null;
}

const FORM_STORAGE_KEY = "scene-generator-form";

interface FormState {
  text: string;
  language: string;
  avatarId: string;
  backgroundUrl: string;
  emotion: string;
  format: string;
  script: string;
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
  const [script, setScript] = useState("");
  const [showAssistant, setShowAssistant] = useState(false);

  // Restore form state + active job from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORM_STORAGE_KEY);
      if (raw) {
        const saved: Partial<FormState> = JSON.parse(raw);
        if (saved.text) setText(saved.text);
        if (saved.language) setLanguage(saved.language);
        if (saved.avatarId) setAvatarId(saved.avatarId);
        if (saved.backgroundUrl) setBackgroundUrl(saved.backgroundUrl);
        if (saved.emotion) setEmotion(saved.emotion);
        if (saved.format) setFormat(saved.format);
        if (saved.script) setScript(saved.script);
      }
    } catch {
      // ignore
    }
    const savedJob = localStorage.getItem("activeJobId");
    if (savedJob) {
      setJobId(savedJob);
      setGenerating(true);
    }
  }, []);

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

  const [pollErrors, setPollErrors] = useState(0);
  const MAX_POLL_ERRORS = 12; // ~60s of retries before giving up

  // Auto-poll whenever there is an active jobId and we're generating
  useEffect(() => {
    if (!jobId || !generating) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/gpu/status?job_id=${jobId}`);
        if (cancelled) return;

        if (!res.ok) {
          setPollErrors((prev) => {
            const next = prev + 1;
            if (next >= MAX_POLL_ERRORS) {
              setError("Impossible de récupérer le statut du job. Vérifiez la VM.");
              setGenerating(false);
              localStorage.removeItem("activeJobId");
            }
            return next;
          });
          return;
        }

        setPollErrors(0);
        const data: JobStatus = await res.json();
        setJobStatus(data);

        if (data.status === "completed" || data.status === "failed") {
          setGenerating(false);
          localStorage.removeItem("activeJobId");
          if (data.status === "failed") {
            setError(data.error ?? "La génération a échoué");
          }
        }
      } catch {
        if (cancelled) return;
        setPollErrors((prev) => {
          const next = prev + 1;
          if (next >= MAX_POLL_ERRORS) {
            setError("Connexion perdue avec la VM GPU.");
            setGenerating(false);
            localStorage.removeItem("activeJobId");
          }
          return next;
        });
      }
    };

    // Poll immediately, then every 5 seconds
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, generating]);

  const handleGenerate = async () => {
    if (!text.trim() || !avatarId) return;
    setError("");
    setGenerating(true);
    setJobStatus(null);
    setJobId(null);
    setPollErrors(0);

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
        const rawText = await res.text();
        let errorMsg = "Erreur lors du lancement";
        try {
          const data = JSON.parse(rawText);
          errorMsg = data.error ?? errorMsg;
        } catch {
          errorMsg = `Erreur serveur (${res.status})`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      localStorage.setItem("activeJobId", data.job_id);
      setJobId(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setGenerating(false);
    }
  };

  const isCompleted = jobStatus?.status === "completed";
  const progress = jobStatus?.progress ?? 0;

  // Persist form state to localStorage on change
  useEffect(() => {
    const state: FormState = { text, language, avatarId, backgroundUrl, emotion, format, script };
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(state));
  }, [text, language, avatarId, backgroundUrl, emotion, format, script]);

  const handleExtractSpoken = () => {
    const spoken = extractSpokenText(script);
    setText(spoken);
  };

  const handleUseFullScript = () => {
    setText(script);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Script input */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-300">
            <FileText className="mr-1.5 inline h-4 w-4" />
            Script
          </label>
          <button
            type="button"
            onClick={() => setShowAssistant(!showAssistant)}
            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            {showAssistant ? "Masquer l'assistant" : "Générer avec l'IA"}
          </button>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Collez votre script ici (avec directions de scène, TEXTE :, etc.)..."
          rows={6}
          className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
        />
        {script.trim() && (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleExtractSpoken}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
            >
              <MessageSquare className="h-3 w-3" />
              Extraire le texte parlé
            </button>
            <button
              type="button"
              onClick={handleUseFullScript}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-600"
            >
              <FileText className="h-3 w-3" />
              Utiliser tel quel
            </button>
          </div>
        )}
      </div>

      {/* Script assistant (collapsible) */}
      {showAssistant && (
        <ScriptAssistant onInsert={(s) => setScript(s)} />
      )}

      {/* Texte à dire (spoken text) */}
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          <MessageSquare className="mr-1.5 inline h-4 w-4" />
          Texte à dire (envoyé à l&apos;avatar)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Le texte que l'avatar va prononcer apparaîtra ici..."
          rows={4}
          className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
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
        <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <p>{error}</p>
          {(error.includes("échantillon vocal") || error.includes("voice") || error.includes("vocal")) && (
            <p className="mt-1">
              <a href="/avatars" className="underline hover:text-red-300">
                → Aller dans Avatars pour uploader votre voix
              </a>
            </p>
          )}
        </div>
      )}

      {/* Progress bar */}
      {generating && jobId && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-zinc-400">
              {pollErrors > 0
                ? `Reconnexion à la VM... (tentative ${pollErrors}/${MAX_POLL_ERRORS})`
                : jobStatus?.status === "processing"
                  ? "Génération en cours..."
                  : "En attente..."}
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
