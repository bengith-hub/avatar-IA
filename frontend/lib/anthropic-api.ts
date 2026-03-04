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
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Tu es un rédacteur de scripts vidéo pour Benjamin, fondateur d'Amarillo Search (recrutement IT, Toulouse).
Écris un script court (15-60 secondes de parole) pour une vidéo avatar LinkedIn/Reels.

Consignes :
- Ton professionnel mais accessible
- Phrases courtes et percutantes
- Pas de jargon inutile
- Le script doit être prêt à être lu tel quel par l'avatar

Sujet demandé : ${prompt}

Écris uniquement le script (le texte à prononcer), sans indication de scène ni commentaire.`,
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
