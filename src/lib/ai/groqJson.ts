/* Panggilan Groq yang mengembalikan objek JSON (dipakai pemrosesan latar belakang seperti analisis CV).
   Batas kuota (429) dilempar sebagai KuotaPenuh agar pemanggil bisa menjadwalkan ulang, bukan menunggu lama. */
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

export async function groqJson(sistem: string, pengguna: string, maksToken = 2200): Promise<Record<string, unknown>> {
  const kunci = process.env.GROQ_API_KEY;
  if (!kunci) throw new Error('GROQ_API_KEY belum diisi');
  let galatTerakhir = '';
  for (const model of [MODEL(), MODEL(), CADANGAN]) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kunci}` },
      body: JSON.stringify({
        model, temperature: 0.1, max_completion_tokens: maksToken, reasoning_effort: 'low', response_format: { type: 'json_object' },
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
