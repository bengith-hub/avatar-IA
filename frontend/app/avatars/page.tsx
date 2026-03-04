"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Plus, UserCircle, Mic, RefreshCw, Sparkles, Check, Loader2, X, ZoomIn } from "lucide-react";

interface Avatar {
  id: string;
  name: string;
  type: string;
}

interface AstriaResult {
  id: number;
  images: string[];
  status: string;
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Astria state
  const [astriaPrompt, setAstriaPrompt] = useState("");
  const [astriaGenerating, setAstriaGenerating] = useState(false);
  const [astriaResult, setAstriaResult] = useState<AstriaResult | null>(null);
  const [astriaError, setAstriaError] = useState("");
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchAvatars = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gpu/avatars");
      if (!res.ok) throw new Error("Worker non disponible");
      const data = await res.json();
      setAvatars(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setAvatars([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvatars();
  }, []);

  // Poll Astria status with timeout
  const pollStartRef = useRef<number>(0);

  useEffect(() => {
    if (!astriaResult || !astriaGenerating) return;

    const isComplete = (data: AstriaResult) =>
      data.status === "processed" ||
      data.status === "error" ||
      (data.images && data.images.length > 0);

    if (isComplete(astriaResult)) {
      setAstriaGenerating(false);
      return;
    }

    if (!pollStartRef.current) pollStartRef.current = Date.now();
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    const interval = setInterval(async () => {
      if (Date.now() - pollStartRef.current > TIMEOUT_MS) {
        setAstriaGenerating(false);
        setAstriaError("Timeout : la génération a pris trop de temps. Vérifiez sur astria.ai.");
        pollStartRef.current = 0;
        return;
      }
      try {
        const res = await fetch(`/api/astria/status?prompt_id=${astriaResult.id}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setAstriaError(errData.error || `Erreur polling (${res.status})`);
          return;
        }
        const data = await res.json();
        setAstriaResult(data);
        if (isComplete(data)) {
          setAstriaGenerating(false);
          pollStartRef.current = 0;
        }
      } catch (err) {
        setAstriaError(err instanceof Error ? err.message : "Erreur réseau pendant le polling");
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [astriaResult, astriaGenerating]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/gpu/avatars", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Upload échoué");
      }
      await fetchAvatars();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAstriaGenerate = async () => {
    if (!astriaPrompt.trim()) return;

    setAstriaGenerating(true);
    setAstriaError("");
    setAstriaResult(null);
    setSelectedImages(new Set());
    pollStartRef.current = Date.now();

    try {
      const res = await fetch("/api/astria/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: astriaPrompt }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Génération échouée");
      }

      const data = await res.json();
      setAstriaResult(data);
    } catch (err) {
      setAstriaError(err instanceof Error ? err.message : "Erreur");
      setAstriaGenerating(false);
    }
  };

  const toggleImageSelection = (url: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const promptSuggestions = [
    "photo professionnelle, costume bleu marine, fond blanc studio",
    "photo casual, polo noir, bureau moderne en arrière-plan",
    "portrait confiant, chemise blanche, éclairage studio",
    "photo debout, costume gris, mains dans les poches, fond neutre",
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Avatars & Voix</h1>
        <button
          onClick={fetchAvatars}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
      )}

      {/* Astria AI Generator */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-purple-400" />
          Générer des photos IA (Astria)
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Décrivez la tenue et le style souhaités. Astria génère des photos réalistes de vous
          que vous pouvez utiliser comme avatars.
        </p>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-3">
            <textarea
              value={astriaPrompt}
              onChange={(e) => setAstriaPrompt(e.target.value)}
              placeholder="Ex: photo professionnelle, costume bleu marine, fond blanc studio"
              rows={2}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
            />
          </div>

          {/* Suggestions */}
          <div className="mb-4 flex flex-wrap gap-2">
            {promptSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setAstriaPrompt(suggestion)}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-purple-500 hover:text-purple-300"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <button
            onClick={handleAstriaGenerate}
            disabled={astriaGenerating || !astriaPrompt.trim()}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {astriaGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Générer 4 photos
              </>
            )}
          </button>

          {astriaError && (
            <p className="mt-3 text-sm text-red-400">{astriaError}</p>
          )}

          {/* Results */}
          {astriaResult && astriaResult.status === "processed" && astriaResult.images?.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-sm text-zinc-400">
                Cliquez sur les photos que vous souhaitez garder comme avatars :
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {astriaResult.images.map((url, i) => (
                  <div
                    key={i}
                    className={`group relative overflow-hidden rounded-lg border-2 transition-all ${
                      selectedImages.has(url)
                        ? "border-purple-500 ring-2 ring-purple-500/30"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    <button
                      onClick={() => toggleImageSelection(url)}
                      className="w-full"
                    >
                      <img
                        src={url}
                        alt={`Génération ${i + 1}`}
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                    {selectedImages.has(url) && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-purple-500/20">
                        <Check className="h-8 w-8 text-white drop-shadow-lg" />
                      </div>
                    )}
                    <button
                      onClick={() => setPreviewUrl(url)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                      title="Agrandir"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {selectedImages.size > 0 && (
                <p className="mt-3 text-sm text-zinc-400">
                  {selectedImages.size} photo{selectedImages.size > 1 ? "s" : ""} sélectionnée{selectedImages.size > 1 ? "s" : ""}
                  — ces images seront utilisables comme avatars quand la VM GPU sera active.
                </p>
              )}
            </div>
          )}

          {astriaResult && astriaResult.status !== "processed" && astriaResult.status !== "error" && (
            <div className="mt-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              <p className="text-sm text-zinc-400">
                Génération en cours... cela peut prendre 1 à 3 minutes.
              </p>
            </div>
          )}

          {astriaResult && astriaResult.status === "error" && (
            <p className="mt-3 text-sm text-red-400">
              La génération a échoué. Réessayez avec un autre prompt.
            </p>
          )}
        </div>
      </section>

      {/* Photos de référence */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <UserCircle className="h-5 w-5 text-blue-400" />
          Photos de référence
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Ajoutez des photos de référence pour l&apos;avatar. Vous pouvez aussi générer des
          photos avec Astria ci-dessus.
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {avatars.map((avatar) => (
            <div
              key={avatar.id}
              className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 text-2xl font-bold text-zinc-500">
                {avatar.name.charAt(0)}
              </div>
              <span className="text-sm font-medium text-white">{avatar.name}</span>
              <span className="text-xs text-zinc-500">{avatar.type}</span>
            </div>
          ))}

          {/* Upload button */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 p-4 text-zinc-500 transition-colors hover:border-blue-500 hover:text-blue-400"
          >
            <Plus className="mb-2 h-8 w-8" />
            <span className="text-sm">{uploading ? "Upload..." : "Ajouter"}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </section>

      {/* Échantillon vocal */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Mic className="h-5 w-5 text-green-400" />
          Échantillon vocal
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Un échantillon de 10 à 30 secondes de votre voix est nécessaire pour le clone vocal.
          Parlez naturellement dans un environnement calme.
        </p>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <Mic className="h-5 w-5 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Voix de Benjamin</p>
              <p className="text-xs text-zinc-500">
                L&apos;échantillon vocal est stocké sur la VM GPU. Démarrez la VM pour
                gérer vos échantillons.
              </p>
            </div>
            <button className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-white">
              <Upload className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-zinc-800 p-2 text-white hover:bg-zinc-700"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={previewUrl}
            alt="Prévisualisation"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
