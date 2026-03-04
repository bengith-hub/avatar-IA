"use client";

import { useRef } from "react";
import { Download, ExternalLink } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  jobId: string;
  onOpenCanva?: () => void;
}

const VideoPlayer = ({ src, jobId, onOpenCanva }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <video
        ref={videoRef}
        src={src}
        controls
        className="aspect-video w-full bg-black"
      />
      <div className="flex gap-2 p-3">
        <a
          href={`/api/gpu/download?job_id=${jobId}`}
          download
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
        >
          <Download className="h-4 w-4" />
          Télécharger
        </a>
        {onOpenCanva && (
          <button
            onClick={onOpenCanva}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir dans Canva
          </button>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
