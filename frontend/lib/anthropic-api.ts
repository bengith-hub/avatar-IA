const ANTHROPIC_BASE = "https://api.anthropic.com/v1";

export async function generateScript(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Tu es un réalisateur et scénariste vidéo professionnel.
Écris un script vidéo complet (15-60 secondes) pour une vidéo avatar destinée aux réseaux sociaux (LinkedIn, Reels, TikTok, YouTube Shorts, etc.).

FORMAT OBLIGATOIRE — utilise exactement cette structure :

TITRE : [titre accrocheur de la vidéo]
DURÉE : [durée estimée]
TON : [ton choisi : professionnel / éducatif / inspirant / humoristique / storytelling]

---

[SCÈNE 1 — description visuelle : décor suggéré, cadrage, ambiance]
TEXTE : « Le texte exact que l'avatar doit prononcer pour cette scène. »

[SCÈNE 2 — description visuelle]
TEXTE : « Suite du texte parlé. »

(autant de scènes que nécessaire)

---

NOTES DE PRODUCTION :
- [suggestions de musique, transitions, textes à l'écran, etc.]

Consignes :
- Adapte le ton au sujet
- Le texte entre guillemets « » doit être prêt à être lu tel quel par l'avatar
- Les descriptions de scènes servent de guide pour le montage dans Canva
- Phrases courtes et percutantes
- Tu peux traiter n'importe quel sujet : business, tech, lifestyle, éducation, actualité, storytelling, motivation, etc.

Sujet demandé : ${prompt}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content = data.content?.[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response format from Anthropic");
  }
  return content.text;
}
