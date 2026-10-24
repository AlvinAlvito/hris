'use client';
/* Pemanggil API dari browser. Melempar Error berisi pesan dari server bila gagal. */
export class GalatApi extends Error {
  constructor(pesan: string, public kode: number) { super(pesan); }
}
let penangan401: (() => void) | null = null;
export function saatSesiHabis(fn: () => void) { penangan401 = fn; }

let sibuk = 0;
const pendengarSibuk = new Set<(n: number) => void>();
export function pantauSibuk(fn: (n: number) => void) { pendengarSibuk.add(fn); return () => { pendengarSibuk.delete(fn); }; }
const ubahSibuk = (d: number) => { sibuk = Math.max(0, sibuk + d); pendengarSibuk.forEach((f) => f(sibuk)); };

export async function api<T = any>(aksi: string, data: Record<string, unknown> = {}, diam = false): Promise<T> {
  if (!diam) ubahSibuk(1);
  try {
    const r = await fetch('/api/' + aksi, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin',
    });
    let j: { ok: boolean; data?: T; error?: string };
    try { j = await r.json(); } catch { throw new GalatApi('Server tidak merespons dengan benar', r.status); }
    if (r.status === 401 && aksi !== 'login') penangan401?.();
    if (!j.ok) throw new GalatApi(j.error || 'Terjadi kesalahan', r.status);
    return j.data as T;
  } catch (e) {
    if (e instanceof GalatApi) throw e;
    throw new GalatApi('Tidak dapat terhubung ke server. Periksa koneksi internet.', 0);
  } finally {
    if (!diam) ubahSibuk(-1);
  }
}
