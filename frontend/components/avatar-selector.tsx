"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

interface AvatarSelectorProps {
  avatars: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}

const AvatarSelector = ({ avatars, value, onChange }: AvatarSelectorProps) => {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-300">
        Avatar
      </label>
      {avatars.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun avatar disponible. Ajoutez des photos dans la page Avatars.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {avatars.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              onClick={() => onChange(avatar.id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border p-3 text-sm transition-colors",
                value === avatar.id
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700 text-lg font-bold text-zinc-300">
                {avatar.name.charAt(0)}
              </div>
              <span className="truncate">{avatar.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AvatarSelector;
