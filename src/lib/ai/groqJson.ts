/* Panggilan AI yang mengembalikan objek JSON (analisis CV, kualifikasi lowongan, soal tes, dll.).
   Urutan: Claude (AI utama) -> Groq (cadangan) bila Claude gagal / belum dikonfigurasi.
   Batas kuota Groq (429) dilempar sebagai KuotaPenuh agar pemanggil bisa menjadwalkan ulang, bukan menunggu lama. */
import { adaClaude, claudeTeks } from './claude';

export class KuotaPenuh extends Error {}

const MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const CADANGAN = 'openai/gpt-oss-20b';

/* ambil objek JSON pertama dari teks (model kadang menambah kalimat di luar JSON) */
function uraiJson(teks: string): Record<string, unknown> {
  try { return JSON.parse(teks); } catch { /* lanjut */ }
  const a = teks.indexOf('{'), z = teks.lastIndexOf('}');
  if (a >= 0 && z > a) return JSON.parse(teks.slice(a, z + 1));
  throw new Error('Jawaban AI bukan JSON');
}

/* nalar: tingkat penalaran model; 'medium' untuk tugas yang butuh ketelitian hitung (mis. menyusun soal & kunci jawaban) */
export async function groqJson(sistem: string, pengguna: string, maksToken = 2200, nalar: 'low' | 'medium' | 'high' = 'low'): Promise<Record<string, unknown>> {
  if (adaClaude()) {
    try {
      // token berpikir ikut dihitung dalam max_tokens -> beri ruang lebih
      const teks = await claudeTeks(sistem + '\n\nBalas HANYA dengan satu objek JSON yang valid, tanpa teks lain.', pengguna, Math.min(32000, Math.max(8000, maksToken * 2)), nalar);
      return uraiJson(teks);
    } catch (e) {
      console.error('[ai] Claude gagal, beralih ke Groq:', e instanceof Error ? e.message.slice(0, 200) : e);
    }
  }
  return groqSaja(sistem, pengguna, maksToken, nalar);
}

async function groqSaja(sistem: string, pengguna: string, maksToken: number, nalar: 'low' | 'medium' | 'high'): Promise<Record<string, unknown>> {
  const kunci = process.env.GROQ_API_KEY;
  if (!kunci) throw new Error('GROQ_API_KEY belum diisi');
  let galatTerakhir = '';
  for (const model of [MODEL(), MODEL(), CADANGAN]) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kunci}` },
      body: JSON.stringify({
        model, temperature: 0.1, max_completion_tokens: maksToken, reasoning_effort: nalar, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sistem }, { role: 'user', content: pengguna }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      try { return uraiJson(j.choices?.[0]?.message?.content ?? ''); } catch (e) { galatTerakhir = String(e); continue; }
    }
    if (r.status === 429) throw new KuotaPenuh('Kuota AI per menit penuh');
    galatTerakhir = `${r.status} ${JSON.stringify(j).slice(0, 200)}`;
    // JSON tidak valid dari model (400 json_validate_failed) atau gangguan sementara: coba model berikutnya
    if (r.status !== 400 && r.status < 500) break;
  }
  throw new Error('Layanan AI gagal: ' + galatTerakhir);
}
