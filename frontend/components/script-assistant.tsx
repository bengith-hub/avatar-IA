"use client";

import { useState } from "react";
import { Sparkles, Loader2, FileText, MessageSquare } from "lucide-react";

interface ScriptAssistantProps {
  onInsert: (script: string) => void;
}

function extractSpokenText(script: string): string {
  const lines: string[] = [];
  const regex = /TEXTE\s*:\s*[«""]([^»""]+)[»""]/g;
  let match;
  while ((match = regex.exec(script)) !== null) {
    lines.push(match[1].trim());
  }
  return lines.length > 0 ? lines.join("\n\n") : script;
}

const ScriptAssistant = ({ onInsert }: ScriptAssistantProps) => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult("");

    try {
      const res = await fetch("/api/ai/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) throw new Error("Erreur lors de la génération");
      const data = await res.json();
      setResult(data.script);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-medium text-zinc-300">Assistant Script IA</h3>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Décrivez le sujet de la vidéo... Ex: 3 astuces pour réussir un entretien, Les tendances IA en 2026, Pourquoi voyager seul change la vie..."
        rows={2}
        className="mb-2 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500"
      />

      <button
        onClick={generate}
        disabled={loading || !prompt.trim()}
        className="mb-3 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        Générer le script
      </button>

      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

      {result && (
        <div>
          <pre className="mb-3 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
            {result}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => onInsert(extractSpokenText(result))}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              <MessageSquare className="h-3 w-3" />
              Utiliser le texte parlé
            </button>
            <button
              onClick={() => onInsert(result)}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-600"
            >
              <FileText className="h-3 w-3" />
              Utiliser le script complet
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScriptAssistant;
