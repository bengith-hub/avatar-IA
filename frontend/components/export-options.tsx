"use client";

import { Download } from "lucide-react";

interface ExportOptionsProps {
  jobId: string;
}

const ExportOptions = ({ jobId }: ExportOptionsProps) => {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-zinc-300">Export</h3>
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/gpu/download?job_id=${jobId}`}
          download={`avatar-${jobId}.mp4`}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
        >
          <Download className="h-4 w-4" />
          MP4 original
        </a>
      </div>
    </div>
  );
};

export default ExportOptions;
