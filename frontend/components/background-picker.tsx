"use client";

import { useState } from "react";
import { Search, Upload, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface BackgroundPickerProps {
  value: string;
  onChange: (url: string) => void;
}

const PRESETS = [
  { id: "none", label: "Aucun", color: "bg-transparent" },
  { id: "blur", label: "Flou studio", color: "bg-zinc-600" },
  { id: "white", label: "Blanc", color: "bg-white" },
  { id: "black", label: "Noir", color: "bg-black" },
  { id: "gradient-blue", label: "Dégradé bleu", color: "bg-gradient-to-br from-blue-900 to-blue-600" },
];

const BackgroundPicker = ({ value, onChange }: BackgroundPickerProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; src: string; alt: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<"presets" | "pexels">("presets");

  const searchPexels = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/pexels/search?query=${encodeURIComponent(query)}&type=photos`);
      if (!res.ok) throw new Error("Recherche échouée");
      const data = await res.json();
      setResults(
        (data.photos ?? []).map((p: { id: number; src: { medium: string }; alt: string }) => ({
          id: String(p.id),
          src: p.src.medium,
          alt: p.alt,
        }))
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-300">
        Décor / Fond
      </label>

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("presets")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "presets" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
          )}
        >
          Prédéfinis
        </button>
        <button
          type="button"
          onClick={() => setTab("pexels")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "pexels" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
          )}
        >
          Recherche Pexels
        </button>
      </div>

      {tab === "presets" && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.id === "none" ? "" : `preset:${preset.id}`)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                value === (preset.id === "none" ? "" : `preset:${preset.id}`)
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-zinc-700 hover:border-zinc-600"
              )}
            >
              <div className={cn("h-4 w-4 rounded border border-zinc-600", preset.color)} />
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {tab === "pexels" && (
        <div>
          <div className="mb-3 flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchPexels())}
              placeholder="Rechercher un décor..."
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={searchPexels}
              disabled={searching}
              className="rounded-lg bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>

          {results.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onChange(r.src)}
                  className={cn(
                    "overflow-hidden rounded-lg border-2 transition-colors",
                    value === r.src ? "border-blue-500" : "border-transparent hover:border-zinc-600"
                  )}
                >
                  <img src={r.src} alt={r.alt} className="aspect-video w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {value && value.startsWith("http") && (
            <div className="mt-2 flex items-center gap-2">
              <span className="truncate text-xs text-zinc-400">{value}</span>
              <button type="button" onClick={() => onChange("")}>
                <X className="h-3 w-3 text-zinc-500 hover:text-white" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BackgroundPicker;
