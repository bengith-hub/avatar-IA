"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ActiveJobBanner = () => {
  const pathname = usePathname();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      setActiveJobId(localStorage.getItem("activeJobId"));
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, []);

  // Don't show on the generate page — it already has its own progress bar
  if (!activeJobId || pathname === "/generate") return null;

  return (
    <Link
      href="/generate"
      className="flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-lg px-4 py-2 mb-4 text-sm text-blue-300 hover:bg-blue-600/30 transition-colors"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Une vidéo est en cours de génération.</span>
      <span className="ml-auto text-xs text-blue-400 underline">Voir la progression →</span>
    </Link>
  );
};

export default ActiveJobBanner;
