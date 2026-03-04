"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Plus, UserCircle, Mic, RefreshCw } from "lucide-react";

interface Avatar {
  id: string;
  name: string;
  type: string;
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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

      {/* Photos de référence */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <UserCircle className="h-5 w-5 text-blue-400" />
          Photos de référence
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Ajoutez des photos de référence pour l&apos;avatar. Plusieurs poses recommandées :
          buste, pied, assis.
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
    </div>
  );
}
