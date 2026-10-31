import { env } from '../config/env.js';

export type Scores = Record<string, number>;
export type ModelResult = { categories: Scores; models: string[]; language?: string };

const headers = () => ({ 'x-moderation-secret': env.MODERATION_SECRET });

async function call(path: string, init: RequestInit): Promise<ModelResult> {
  const response = await fetch(`${env.MODERATION_URL}${path}`, { ...init, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Moderation service answered ${response.status}`);
  return response.json() as Promise<ModelResult>;
}

export const scoreText = (text: string) => call('/v1/text', { method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 20_000) }) });
export const scoreImage = (image: Buffer) => call('/v1/image', { method: 'POST', headers: { ...headers(), 'content-type': 'application/octet-stream' }, body: new Uint8Array(image) });
