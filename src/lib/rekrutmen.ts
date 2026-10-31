/* Rekrutmen: penyimpanan CV, ekstraksi teks (PDF/DOCX), analisis AI (parsing CV + peringkat kecocokan),
   dan antrean pemrosesan latar belakang yang tahan batas kuota Groq. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';
import { exec, q, q1, type Baris } from './db';
import { folderPenyimpanan, jalurAman } from './berkas';
import { tglWIB } from './waktu';
import { groqJson, KuotaPenuh } from './ai/groqJson';
import { beriTahu } from './notifikasi';

export const TAHAP = ['baru', 'disaring', 'tes', 'wawancara_hc', 'wawancara_user', 'penawaran', 'diterima', 'ditolak'] as const;
export type Tahap = (typeof TAHAP)[number];
export const LABEL_TAHAP: Record<Tahap, string> = {
  baru: 'Baru', disaring: 'Lolos Saring', tes: 'Tes / Psikotes', wawancara_hc: 'Wawancara HC', wawancara_user: 'Wawancara User',
  penawaran: 'Penawaran', diterima: 'Diterima', ditolak: 'Ditolak',
};
export const LABEL_TIPE: Record<string, string> = { tetap: 'Karyawan Tetap', kontrak: 'Kontrak', magang: 'Magang', freelance: 'Freelance', paruh_waktu: 'Paruh Waktu' };
const MAKS_PERCOBAAN = 4;

/* ---------- CV ---------- */
export type JenisCv = { ext: 'pdf' | 'docx'; mime: string };
export function kenaliCv(buf: Buffer): JenisCv | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf.includes(Buffer.from('word/document.xml')))
    return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  return null;
}
export async function simpanCv(buf: Buffer, jenis: JenisCv): Promise<string> {
  const sub = 'rekrutmen/' + tglWIB().slice(0, 7).replace('-', '/');
  await mkdir(path.join(folderPenyimpanan('private'), sub), { recursive: true });
  const nama = `${sub}/${randomBytes(16).toString('hex')}.${jenis.ext}`;
  await writeFile(path.join(folderPenyimpanan('private'), nama), buf);
  return nama;
}
export async function bacaCv(relatif: string): Promise<Buffer | null> {
  const p = jalurAman(folderPenyimpanan('private'), relatif);
  if (!p) return null;
  try { return await readFile(p); } catch { return null; }
}
const entitas = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
/* teks CV: PDF lewat unpdf, DOCX dibuka sebagai ZIP lalu dibaca word/document.xml */
export async function ekstrakTeksCv(buf: Buffer, ext: string): Promise<string> {
  let teks = '';
  if (ext === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    teks = (await extractText(pdf, { mergePages: true })).text;
  } else {
    const zip = XLSX.CFB.read(buf, { type: 'buffer' });
    const i = zip.FullPaths.findIndex((p: string) => p.endsWith('/word/document.xml'));
    if (i < 0) throw new Error('Isi DOCX tidak ditemukan');
    const xml = Buffer.from(zip.FileIndex[i].content as Uint8Array).toString('utf8');
    teks = entitas(xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''));
  }
  return teks.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
}

/* ---------- analisis AI ---------- */
const PROMPT_SISTEM = `Anda adalah asesor rekrutmen profesional di Indonesia. Tugas: (1) mengekstrak CV menjadi data terstruktur, (2) menilai kecocokan kandidat dengan lowongan secara objektif berdasarkan bukti di CV.
ATURAN:
- Hanya gunakan informasi yang tertulis di CV / jawaban. Jangan mengarang. Bila tidak ada, isi null atau [].
- ANTI-BIAS: abaikan sepenuhnya usia, jenis kelamin, agama, suku, status pernikahan, foto, dan asal daerah. Jangan menyebutnya dalam penilaian.
- Nilai setiap aspek pada skor_rinci dengan skala 0-100 (BUKAN poin berbobot): 100 = sangat memenuhi, 50 = sebagian, 0 = tidak ada sama sekali.
  kualifikasi_wajib = seberapa banyak & seberapa kuat syarat wajib terpenuhi; pengalaman = relevansi & lamanya pengalaman terhadap posisi; keahlian = kecocokan keahlian;
  pendidikan = kesesuaian jenjang & jurusan; nilai_plus = nilai tambah yang terpenuhi.
- "syarat" berisi TEPAT satu item untuk setiap NOMOR pada daftar KUALIFIKASI WAJIB (bukan nilai plus), memakai nomor yang sama. Status: "ya" (ada bukti eksplisit di CV), "sebagian" (hanya bukti tidak langsung / sebagian), atau "tidak". Bersikap ketat: jangan menganggap terpenuhi tanpa bukti tertulis. Isi "bukti" dengan kutipan/ringkasan singkat dari CV.
- Tulis dalam Bahasa Indonesia yang ringkas dan profesional.
Keluarkan HANYA JSON dengan bentuk:
{"profil":{"ringkasan":"2-3 kalimat","pendidikan":[{"jenjang":"","jurusan":"","institusi":"","tahun":""}],"pengalaman":[{"posisi":"","perusahaan":"","periode":"","bulan":0,"ringkas":""}],"total_pengalaman_bulan":0,"keahlian":[""],"sertifikat":[""],"bahasa":[""],"domisili":null},
"penilaian":{"skor_rinci":{"kualifikasi_wajib":0,"pengalaman":0,"keahlian":0,"pendidikan":0,"nilai_plus":0},"syarat":[{"no":1,"status":"ya|sebagian|tidak","bukti":"..."}],"kekuatan":[""],"kekurangan":[""],"bendera_merah":[""],"pertanyaan_wawancara":[""],"rekomendasi":"1 kalimat saran tindak lanjut untuk HC"}}`;
/* bobot skor akhir — dihitung di server agar konsisten antar kandidat */
const BOBOT: Record<string, number> = { kualifikasi_wajib: 0.45, pengalaman: 0.25, keahlian: 0.15, pendidikan: 0.1, nilai_plus: 0.05 };

const baris = (t: unknown) => String(t ?? '').split('\n').map((x) => x.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);
export function pertanyaanLowongan(lw: Baris): string[] { try { const a = JSON.parse(lw.pertanyaan || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } }

async function analisis(l: Baris, lw: Baris): Promise<Record<string, any>> {
  const jawaban: Record<string, string> = (() => { try { return JSON.parse(l.jawaban || '{}'); } catch { return {}; } })();
  const isi = [
    `LOWONGAN: ${lw.judul} (${LABEL_TIPE[lw.tipe] ?? lw.tipe})${lw.divisi ? ' · divisi ' + lw.divisi : ''}${lw.lokasi ? ' · ' + lw.lokasi : ''}`,
    lw.deskripsi ? `DESKRIPSI: ${String(lw.deskripsi).slice(0, 1500)}` : '',
    `KUALIFIKASI WAJIB (nilai setiap nomor):\n${baris(lw.kualifikasi).map((x, n) => `${n + 1}. ${x}`).join('\n') || '(tidak dicantumkan — kosongkan "syarat")'}`,
    baris(lw.nilai_plus).length ? `NILAI PLUS:\n${baris(lw.nilai_plus).map((x) => '- ' + x).join('\n')}` : '',
    `ISIAN PELAMAR (pengakuan sendiri — WAJIB dicocokkan dengan CV. Bila jabatan/tempat kerja terakhir, lama pengalaman, atau pendidikan berbeda dari CV, tulis perbedaannya di bendera_merah):
- Pendidikan terakhir: ${l.pendidikan || '-'}${l.jurusan ? ' · jurusan ' + l.jurusan : ''}
- Lama pengalaman kerja: ${l.pengalaman || '-'}
- Posisi & tempat kerja terakhir: ${l.kerja_terakhir || '-'}`,
    Object.keys(jawaban).length ? `JAWABAN PERTANYAAN:\n${Object.entries(jawaban).map(([k, v]) => `- ${k}: ${String(v).slice(0, 500)}`).join('\n')}` : '',
    `CV:\n${String(l.cv_teks ?? '').slice(0, 10000)}`,
  ].filter(Boolean).join('\n\n');
  return groqJson(PROMPT_SISTEM, isi);
}
const angka = (v: unknown, maks = 100) => Math.max(0, Math.min(maks, Math.round(Number(v) || 0)));
const daftar = (v: unknown, n = 10) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : x)).filter(Boolean).slice(0, n) : []);

export async function catatRiwayat(lamaranId: number, jenis: 'tahap' | 'catatan' | 'sistem', catatan: string, oleh?: { id: number; nama: string }, dari = '', ke = '') {
  await exec('INSERT INTO lamaran_riwayat (lamaran_id,jenis,dari,ke,catatan,oleh,oleh_nama) VALUES (?,?,?,?,?,?,?)',
    [lamaranId, jenis, dari, ke, catatan.slice(0, 1000), oleh?.id ?? null, oleh?.nama ?? '']);
}

/* proses satu lamaran: ekstrak teks bila belum ada, lalu analisis AI */
async function prosesSatu(id: number): Promise<void> {
  const l = await q1('SELECT * FROM lamaran WHERE id=?', [id]);
  if (!l) return;
  const lw = await q1('SELECT * FROM lowongan WHERE id=?', [l.lowongan_id]);
  if (!lw) return;
  if (!l.cv_teks) {
    const buf = await bacaCv(l.cv_path);
    if (!buf) throw new Error('Berkas CV tidak ditemukan');
    l.cv_teks = await ekstrakTeksCv(buf, l.cv_path.endsWith('.pdf') ? 'pdf' : 'docx');
    await exec('UPDATE lamaran SET cv_teks=? WHERE id=?', [l.cv_teks, id]);
  }
  if (String(l.cv_teks).replace(/\s/g, '').length < 150) {
    await exec("UPDATE lamaran SET ai_status='manual', ai_galat=? WHERE id=?", ['CV tidak berisi teks yang bisa dibaca (kemungkinan hasil scan/foto). Periksa CV secara manual.', id]);
    await catatRiwayat(id, 'sistem', 'CV berupa gambar/scan sehingga tidak bisa dibaca AI. Perlu dinilai manual.');
    return;
  }
  const h = await analisis(l, lw);
  const pn = (h.penilaian ?? {}) as Record<string, any>, pr = (h.profil ?? {}) as Record<string, any>;
  // skor rinci 0..100 per aspek; skor akhir = jumlah berbobot (dihitung di sini, bukan oleh model)
  const mentah = (pn.skor_rinci ?? {}) as Record<string, unknown>;
  const rinciAngka: Record<string, number> = Object.fromEntries(Object.keys(BOBOT).map((k) => [k, angka(mentah[k])]));
  // status per kualifikasi wajib dicocokkan lewat nomornya ke teks kualifikasi asli; item kosong / nomor tak dikenal diabaikan
  const wajib = baris(lw.kualifikasi), dariAi = new Map<number, any>();
  for (const x of daftar(pn.syarat, 30) as any[]) { const no = Number(x?.no); if (no >= 1 && no <= wajib.length && !dariAi.has(no)) dariAi.set(no, x); }
  const syarat = wajib.flatMap((teks, n) => {
    const x = dariAi.get(n + 1);
    if (!x || !['ya', 'sebagian', 'tidak'].includes(x.status)) return [];
    return [{ syarat: teks, status: x.status as string, bukti: String(x.bukti ?? '').slice(0, 300) }];
  });
  let skor = Math.round(Object.entries(BOBOT).reduce((a, [k, b]) => a + rinciAngka[k] * b, 0));
  // syarat wajib yang sama sekali tidak terpenuhi membatasi skor (maks. 55 untuk satu, 40 untuk dua atau lebih)
  const gagalWajib = syarat.filter((x) => x.status === 'tidak').length, skorBobot = skor;
  if (gagalWajib >= 2) skor = Math.min(skor, 40); else if (gagalWajib === 1) skor = Math.min(skor, 55);
  const dibatasi = skor < skorBobot ? `Skor dibatasi ${skor} (dari ${skorBobot}) karena ${gagalWajib} kualifikasi wajib tidak terpenuhi.` : '';
  // cocokkan pengakuan lama pengalaman dengan pengalaman di CV (toleransi 12 bulan) — tidak bergantung pada model
  const bendera = daftar(pn.bendera_merah, 6) as string[];
  const rentangKlaim: Record<string, [number, number]> = { 'Belum ada (fresh graduate)': [0, 0], 'Kurang dari 1 tahun': [0, 11], '1–2 tahun': [12, 35],
    '3–5 tahun': [36, 71], 'Lebih dari 5 tahun': [60, 9999] };
  const klaim = rentangKlaim[l.pengalaman as string], bulanCv = angka(pr.total_pengalaman_bulan, 1200);
  const sudahDisebut = bendera.some((b) => /pengalaman/i.test(b) && /(klaim|isi|aku|tahun|bulan)/i.test(b));
  if (klaim && !sudahDisebut && (bulanCv < klaim[0] - 12 || bulanCv > klaim[1] + 12)) {
    const teksCv = bulanCv >= 12 ? `±${Math.round(bulanCv / 12)} tahun` : `${bulanCv} bulan`;
    bendera.unshift(`Pelamar mengisi pengalaman "${l.pengalaman}", tetapi CV menunjukkan sekitar ${teksCv} pengalaman kerja.`);
  }
  const profil = { ringkasan: String(pr.ringkasan ?? '').slice(0, 800), pendidikan: daftar(pr.pendidikan, 6), pengalaman: daftar(pr.pengalaman, 12),
    total_pengalaman_bulan: angka(pr.total_pengalaman_bulan, 1200), keahlian: daftar(pr.keahlian, 30), sertifikat: daftar(pr.sertifikat, 15),
    bahasa: daftar(pr.bahasa, 8), domisili: pr.domisili ?? null };
  const hasil = { skor_rinci: rinciAngka, dibatasi, syarat, kekuatan: daftar(pn.kekuatan, 8), kekurangan: daftar(pn.kekurangan, 8), bendera_merah: bendera.slice(0, 7),
    pertanyaan_wawancara: daftar(pn.pertanyaan_wawancara, 8), rekomendasi: String(pn.rekomendasi ?? '').slice(0, 400) };
  const kecocokan = skor >= 80 ? 'sangat cocok' : skor >= 65 ? 'cocok' : skor >= 50 ? 'cukup' : 'kurang cocok';
  await exec(`UPDATE lamaran SET profil=?, analisis=?, skor=?, kecocokan=?, ai_status='selesai', ai_galat='', diproses_at=NOW() WHERE id=?`,
    [JSON.stringify(profil), JSON.stringify(hasil), skor, kecocokan, id]);
  await catatRiwayat(id, 'sistem', `AI selesai menilai CV: skor ${skor} (${kecocokan}).`);
}

/* antrean: satu lamaran per putaran agar tidak melampaui kuota token per menit */
let sedangJalan = false;
export async function prosesAntrean(): Promise<void> {
  if (sedangJalan || !process.env.GROQ_API_KEY) return;
  sedangJalan = true;
  try {
    // pemulihan: proses yang terhenti (server mati di tengah jalan) dikembalikan ke antrean
    await exec("UPDATE lamaran SET ai_status='antri' WHERE ai_status='proses' AND updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
    const l = await q1("SELECT id, ai_percobaan FROM lamaran WHERE ai_status='antri' ORDER BY id LIMIT 1");
    if (!l) return;
    const kunci = await exec("UPDATE lamaran SET ai_status='proses' WHERE id=? AND ai_status='antri'", [l.id]);
    if (!kunci.affectedRows) return;
    try {
      await prosesSatu(l.id);
    } catch (e) {
      if (e instanceof KuotaPenuh) { await exec("UPDATE lamaran SET ai_status='antri' WHERE id=?", [l.id]); return; }
      const coba = Number(l.ai_percobaan) + 1, pesan = (e instanceof Error ? e.message : String(e)).slice(0, 250);
      console.error('[rekrutmen] analisis gagal', l.id, pesan);
      await exec('UPDATE lamaran SET ai_status=?, ai_percobaan=?, ai_galat=? WHERE id=?', [coba >= MAKS_PERCOBAAN ? 'gagal' : 'antri', coba, pesan, l.id]);
    }
  } catch (e) { console.error('[rekrutmen] antrean', e); }
  finally { sedangJalan = false; }
}
/* dipanggil setelah lamaran masuk agar langsung diproses tanpa menunggu putaran berikutnya */
export function picuAntrean() { setTimeout(() => { void prosesAntrean(); }, 300); }

declare global { var __pekerjaRekrutmen: NodeJS.Timeout | undefined }
export function mulaiPekerjaRekrutmen() {
  if (globalThis.__pekerjaRekrutmen) return;
  globalThis.__pekerjaRekrutmen = setInterval(() => { void prosesAntrean(); }, 60_000);
  setTimeout(() => { void prosesAntrean(); }, 15_000);
  console.log('[rekrutmen] pekerja analisis CV aktif');
}

/* notifikasi HC saat ada lamaran baru */
export async function kabariHc(namaPelamar: string, posisi: string) {
  const hc = (await q("SELECT id FROM users WHERE aktif=1 AND role IN ('admin','direktur')")).map((x) => x.id as number);
  await beriTahu(hc, { jenis: 'rekrutmen', tautan: '/kelola-rekrutmen', judul: `Lamaran baru: ${posisi}`, isi: `${namaPelamar} melamar posisi ${posisi}. CV sedang dianalisis AI.` });
}
