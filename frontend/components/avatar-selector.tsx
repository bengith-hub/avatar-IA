"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

interface Avatar {
  id: string;
  name: string;
  url?: string;
}

interface AvatarSelectorProps {
  avatars: Avatar[];
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
              {avatar.url ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-full">
                  <Image
                    src={avatar.url}
                    alt={avatar.name}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-xl font-bold text-zinc-300">
                  {avatar.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="max-w-full truncate text-xs">{avatar.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AvatarSelector;
