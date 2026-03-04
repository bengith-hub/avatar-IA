import SceneGenerator from "@/components/scene-generator";

export default function GeneratePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">Générer une vidéo</h1>
      <SceneGenerator />
    </div>
  );
}
