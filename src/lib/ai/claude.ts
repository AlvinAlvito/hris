/* Klien Claude (Anthropic) — AI utama HRIS. Groq tetap menjadi cadangan bila Claude gagal
   (kunci kedaluwarsa / saldo habis / gangguan), jadi fitur AI tidak berhenti total. */
import Anthropic from '@anthropic-ai/sdk';

export const MODEL_CLAUDE = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
export const adaClaude = () => !!process.env.ANTHROPIC_API_KEY;

let klien: Anthropic | null = null;
export function claude(): Anthropic {
  if (!klien) klien = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 1 });
  return klien;
}

/* parameter bersama: penolakan oleh pengaman model dialihkan otomatis ke model cadangan di sisi server */
export const FALLBACK = (): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: 'default' } => ({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });

export type Upaya = 'low' | 'medium' | 'high';

/* satu permintaan teks (tanpa alat); hasilnya gabungan blok teks */
export async function claudeTeks(sistem: string, pengguna: string, maksToken: number, upaya: Upaya = 'low'): Promise<string> {
  const r = await claude().beta.messages.stream({
    ...FALLBACK(), model: MODEL_CLAUDE(), max_tokens: maksToken, system: sistem, output_config: { effort: upaya },
    messages: [{ role: 'user', content: pengguna }],
  }).finalMessage();
  if (r.stop_reason === 'refusal') throw new Error('Claude menolak permintaan');
  if (r.stop_reason === 'max_tokens') throw new Error('Jawaban Claude terpotong (max_tokens)');
  return r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}
