import { createSessionToken, TokenRequestError } from '../utils/livekit-token.js';
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({error: 'Méthode non autorisée.'});
  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const data = body || {};
    return res.status(200).json(await createSessionToken({identity: data.identity || data.participantName, room: data.room || data.roomName, scenario: data.scenario}, process.env));
  } catch (error) {
    const invalid = error instanceof TokenRequestError || error instanceof SyntaxError;
    return res.status(invalid ? 400 : 503).json({error: invalid ? (error instanceof TokenRequestError ? error.message : 'Requête invalide.') : 'Le service vocal est indisponible. Réessayez dans un instant.'});
  }
}
