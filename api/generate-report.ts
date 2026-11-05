const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 1500;
const TOTAL_BUDGET_MS = 40000;
const ATTEMPT_TIMEOUT_MS = 20000;

// Modèle principal configurable, puis modèles de secours si Gemini est saturé (503) ou indisponible.
function reportModels(): string[] {
  const primary = process.env.GEMINI_REPORT_MODEL || 'gemini-3.6-flash';
  return [...new Set([primary, 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])];
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function buildPrompt(transcript: { role: string; text: string }[], scenario: any): string {
  const conversation = transcript
    .map(t => `${t.role === 'candidate' ? 'CANDIDAT' : 'RECRUTEUR'} : ${t.text}`)
    .join('\n');

  return `
Tu es un coach en recrutement expert et un recruteur senior.
Tu analyses UNE simulation d'entretien précise. Le bilan doit être strictement basé sur ce que le candidat a réellement dit dans la transcription ci-dessous.

Contexte du scénario :
- Recruteur : ${scenario?.person || 'Recruteur'} (${scenario?.role || 'RH/Manager'})
- Entretien : ${scenario?.title || 'Entretien'}
- Poste : ${scenario?.position || 'non précisé'}
- Objectif : ${scenario?.objective || ''}
- Contexte : ${scenario?.context || ''}

Transcription complète :
${conversation}

Règles impératives de personnalisation :
- Chaque commentaire, point fort, axe de progrès et exercice doit s'appuyer sur un élément concret de CETTE transcription (cite une courte expression du candidat entre guillemets quand c'est utile).
- Aucun conseil générique qui pourrait s'appliquer à n'importe quel entretien.
- N'invente ni expérience, ni chiffre, ni résultat que le candidat n'a pas mentionnés. Dans la réponse améliorée, utilise des crochets pour les éléments à compléter, par exemple [chiffre] ou [délai].
- La question à retravailler doit être une question réellement posée par le recruteur dans la transcription, et la réponse du candidat doit en reprendre fidèlement le contenu.
- Les scores doivent refléter la qualité réelle des réponses : ne gonfle pas les notes si les réponses sont courtes, vagues ou hors sujet.

Renvoie uniquement un objet JSON valide avec exactement cette structure :
{
  "score": entier de 30 à 100 (performance globale),
  "readinessLabel": "Prêt à convaincre" si score < 82, sinon "Très bien préparé",
  "reportTitle": "résumé percutant de 3 à 6 mots de la prestation",
  "reportSubtitle": "2 phrases d'analyse globale : points forts et axes d'amélioration observés dans cet entretien",
  "pointFortTitle": "titre court du principal point fort observé",
  "pointFortDesc": "1 phrase expliquant pourquoi, en citant ce que le candidat a dit",
  "progresTitle": "titre court du principal axe de progrès observé",
  "progresDesc": "1 phrase de conseil reliée à une réponse précise du candidat",
  "exerciceTitle": "titre de l'exercice recommandé",
  "exerciceDesc": "1 à 2 phrases d'action immédiate, adaptée à ce qu'il a dit",
  "criteria": [
    { "name": "Clarté et concision", "score": entier de 30 à 100, "comment": "observation basée sur ses réponses" },
    { "name": "Pertinence pour le poste", "score": entier de 30 à 100, "comment": "observation sur l'adéquation de ses exemples avec le poste et l'entreprise" },
    { "name": "Qualité des exemples", "score": entier de 30 à 100, "comment": "analyse de la structure de ses exemples (situation, actions, résultats)" },
    { "name": "Motivation", "score": entier de 30 à 100, "comment": "évaluation de l'intérêt exprimé pour le poste et l'entreprise" },
    { "name": "Expression orale", "score": entier de 30 à 100, "comment": "fluidité, structure et ton déduits de la transcription" }
  ],
  "reworkQuestion": "question exacte posée par le recruteur sur laquelle le candidat doit progresser",
  "reworkYourAnswer": "résumé fidèle ou citation de la réponse réellement donnée",
  "reworkShortcomings": "ce qui manquait précisément dans cette réponse",
  "reworkImprovedAnswer": "réponse alternative à la première personne (méthode STAR), qui réutilise les faits donnés par le candidat"
}

Le JSON doit être valide, en français professionnel et encourageant.
`;
}

class GeminiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseReport(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const data = JSON.parse(cleaned);
  if (typeof data?.score !== 'number' || !Array.isArray(data.criteria) || data.criteria.length === 0) {
    throw new Error('Rapport Gemini incomplet');
  }
  return data;
}

async function callGemini(model: string, prompt: string, apiKey: string, timeoutMs: number) {
  const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json' };
  // Réponse plus rapide : pas de phase de réflexion longue sur les modèles 2.5 Flash.
  if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
    }
  );

  if (!response.ok) {
    throw new GeminiHttpError(response.status, `Gemini (${model}) a répondu ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const data = await response.json();
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) throw new Error(`Gemini (${model}) a renvoyé une réponse vide`);
  return parseReport(generatedText);
}

export default async function handler(req: any, res: any) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { transcript, scenario } = req.body || {};

  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
    return res.status(400).json({ error: 'Transcript is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
  }

  // Transcript normalisé et borné (le front envoie {type, speaker, message}).
  const turns = transcript
    .slice(-MAX_MESSAGES)
    .map((t: any) => ({
      role: t?.type === 'candidate' || t?.speaker === 'Vous' ? 'candidate' : 'recruiter',
      text: String(t?.message ?? '').trim().slice(0, MAX_MESSAGE_CHARS)
    }))
    .filter(t => t.text);

  if (turns.length === 0) {
    return res.status(400).json({ error: 'Transcript is empty' });
  }

  const prompt = buildPrompt(turns, scenario);
  const models = reportModels();
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: unknown = null;

  // Deux passes sur la chaîne de modèles : un 503 « forte demande » est le plus souvent passager.
  for (let round = 0; round < 2; round++) {
    for (const model of models) {
      const remaining = deadline - Date.now();
      if (remaining < 4000) break;
      try {
        const report = await callGemini(model, prompt, apiKey, Math.min(ATTEMPT_TIMEOUT_MS, remaining));
        return res.status(200).json(report);
      } catch (err: any) {
        lastError = err;
        console.error(`Report generation failed with ${model}:`, err?.message || err);
        if (err instanceof GeminiHttpError && (err.status === 401 || err.status === 403)) {
          return res.status(500).json({ error: err.message });
        }
      }
    }
    if (round === 0 && deadline - Date.now() > 6000) await sleep(1500);
  }

  const message = (lastError as any)?.message || String(lastError);
  return res.status(503).json({ error: `Le bilan n'a pas pu être généré : ${message}` });
}
