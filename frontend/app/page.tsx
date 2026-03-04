import GpuStatusCard from "@/components/gpu-status-card";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">Dashboard GPU</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <GpuStatusCard />
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">Accès rapide</h2>
          <div className="flex flex-col gap-3">
            <a
              href="/generate"
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Nouvelle vidéo
            </a>
            <a
              href="/gallery"
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-center text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Voir la galerie
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
