import { AccessToken, RoomConfiguration, RoomAgentDispatch } from 'livekit-server-sdk';

export class TokenRequestError extends Error {}
const voices = new Set(['Aoede', 'Kore', 'Fenrir', 'Puck', 'Charon']);
const roomPattern = /^room_recruiter-([\w-]+)_session-([\w-]+)$/;

export function scenarioMetadata(room: string, value: unknown): string {
  const match = room.match(roomPattern);
  if (!match) throw new TokenRequestError('Le salon de simulation est invalide.');
  const prospectId = match[1];
  if (!prospectId.startsWith('custom')) {
    if (!['rh-product-manager','rh-sales','manager-product','tech-frontend','behavior-star','final-director','salary-negotiation'].includes(prospectId)) throw new TokenRequestError('Scénario inconnu.');
    return '';
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TokenRequestError('Le scénario personnalisé est manquant. Rouvrez-le puis réessayez.');
  }
  const input = value as Record<string, unknown>;
  const scenario: Record<string, string> = {};
  for (const field of ['id', 'name', 'role', 'position', 'systemInstruction']) {
    const text = input[field];
    if (typeof text !== 'string' || !text.trim()) {
      throw new TokenRequestError('Le scénario personnalisé est incomplet. Recréez-le puis réessayez.');
    }
    scenario[field] = text.trim();
  }
  if (scenario.id !== prospectId) throw new TokenRequestError('Le scénario ne correspond pas à cet appel.');
  if (['id', 'name', 'role', 'position'].some(key => scenario[key].length > 200)) {
    throw new TokenRequestError('Le nom ou le rôle du scénario est trop long.');
  }
  scenario.voiceName = typeof input.voiceName === 'string' && voices.has(input.voiceName) ? input.voiceName : 'Aoede';
  const metadata = JSON.stringify({ version: 1, scenario });
  if (Buffer.byteLength(metadata, 'utf8') > 12000) {
    throw new TokenRequestError('Le scénario est trop long. Raccourcissez sa description puis recréez-le.');
  }
  return metadata;
}

export async function createSessionToken(input: Record<string, unknown>, env: Record<string, string | undefined>) {
  if (typeof input.identity !== 'string' || !/^[\w-]{1,200}$/.test(input.identity)
      || typeof input.room !== 'string' || input.room.length > 500) {
    throw new TokenRequestError('Les paramètres de connexion sont invalides.');
  }
  const metadata = scenarioMetadata(input.room, input.scenario);
  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_URL: serverUrl } = env;
  if (!apiKey || !apiSecret || !serverUrl) throw new Error('Configuration LiveKit manquante.');
  const token = new AccessToken(apiKey, apiSecret, { identity: input.identity });
  token.addGrant({ roomJoin: true, room: input.room });
  token.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: 'recruitment-agent', metadata })] });
  return { token: await token.toJwt(), serverUrl };
}
