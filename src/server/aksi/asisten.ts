/* AI Asisten HC / Super Admin: menjawab pertanyaan berbasis data HRIS lewat Groq (model dengan pemanggilan alat).
   Data dibaca lewat alat di lib/ai/alat.ts (baca-saja); kolom rahasia tidak pernah dikirim ke model. */
import { gagal } from '@/lib/http';
import { logAksi, need } from '@/lib/aturan';
import { DEFINISI_ALAT, jalankanAlat, konteksAturan } from '@/lib/ai/alat';
import { tglWIB, jamWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MAKS_PUTARAN = 6;
type Pesan = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string };

const MODEL_CADANGAN = 'openai/gpt-oss-20b';
const jeda = (ms: number) => new Promise((s) => setTimeout(s, ms));
/* batas kuota (429): tunggu sesuai retry-after bila singkat, lalu coba lagi; masih penuh -> model cadangan */
async function groq(messages: Pesan[]): Promise<{ content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }> {
  const kunci = process.env.GROQ_API_KEY;
  if (!kunci) gagal('AI Asisten belum dikonfigurasi (GROQ_API_KEY belum diisi di .env.local)');
  const urutan = [MODEL(), MODEL(), MODEL_CADANGAN].filter((m, i, l) => i < 2 || m !== l[0]);
  let tunggu = 0;
  for (const model of urutan) {
    if (tunggu) await jeda(tunggu);
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kunci}` },
      body: JSON.stringify({ model, messages, tools: DEFINISI_ALAT, tool_choice: 'auto', temperature: 0.2, max_completion_tokens: 1800 }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j.choices?.[0]?.message ?? { content: null };
    // model sesekali menulis panggilan alat yang rusak (400 tool_use_failed): cukup coba lagi
    if (r.status === 400 && /tool_use_failed|failed to call a function|parse/i.test(JSON.stringify(j))) { tunggu = 0; continue; }
    if (r.status !== 429) {
      console.error('[asisten] groq', r.status, JSON.stringify(j).slice(0, 400));
      gagal('Layanan AI sedang tidak tersedia (' + r.status + ')');
    }
    const detik = Number(r.headers.get('retry-after')) || 5;
    tunggu = detik <= 20 ? detik * 1000 + 300 : 0;
  }
  gagal('Kuota AI per menit sedang penuh. Tunggu sekitar satu menit, lalu kirim ulang pertanyaan.');
}

/* istilah teknis database yang masih lolos diganti istilah aplikasi */
const ISTILAH: [RegExp, string][] = [
  [/`?\batasan_id\b`?/g, 'atasan langsung'], [/`?\bunit_id\b`?/g, 'unit organisasi'], [/`?\bjabatan_id\b`?/g, 'jabatan'],
  [/`?\bunit_organisasi\b`?/g, 'unit organisasi'], [/`users`/g, 'data karyawan'],
  [/\brole\s*=\s*["“']?atasan["”']?/gi, 'peran Supervisor'], [/\brole\s*=\s*["“']?direktur["”']?/gi, 'peran Super Admin'],
  [/\brole\s*=\s*["“']?admin["”']?/gi, 'peran HC'], [/\brole\s*=\s*["“']?karyawan["”']?/gi, 'peran Staff'],
  [/`dept`|\bkolom dept\b/g, 'divisi'], [/\(?set(?:kan)? ke `?null`?\)?/gi, '(dikosongkan)'], [/`null`/g, 'kosong'],
];
/* jaring pengaman bila model tetap menulis detail teknis: buang blok kode, label "Query yang dijalankan", dan "Hasil: N baris" */
function bersihkan(teks: string): string {
  for (const [pola, ganti] of ISTILAH) teks = teks.replace(pola, ganti);
  return teks
    .replace(/^[ \t]*(>[ \t]*)?```[\s\S]*?^[ \t]*(>[ \t]*)?```[ \t]*$/gm, '')
    .replace(/^[ \t]*(>[ \t]*)?[*_]*(query|kueri|sql)\b[^\n]*:[*_]*[ \t]*$/gim, '')
    .replace(/^[ \t]*(>[ \t]*)?[*_]*hasil[*_]*\s*:\s*\d+\s*baris\.?[*_]*[ \t]*$/gim, '')
    .replace(/^[ \t]*>[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function promptSistem(nama: string): Promise<string> {
  return `Anda adalah "Asisten HRIS POSI", analis SDM untuk Yayasan Pendidikan Posi. Anda membantu ${nama} (HC / Super Admin) menjawab pertanyaan tentang karyawan berdasarkan DATA ASLI di database HRIS.
Hari ini ${tglWIB()} pukul ${jamWIB().slice(0, 5)} WIB. ${await konteksAturan()}

ATURAN WAJIB:
1. Setiap angka/fakta HARUS berasal dari hasil alat. Jangan menebak atau mengarang. Jika data tidak ada, katakan terus terang.
2. Untuk pertanyaan tentang seseorang: panggil cari_karyawan dulu, lalu ringkasan_karyawan. Jika nama ambigu (lebih dari satu hasil), tanyakan yang dimaksud.
3. Untuk perbandingan/peringkat: gunakan rekap_karyawan (abaikan karyawan bernilai 0 dalam peringkat kecuali diminta). Gunakan query_sql hanya bila alat lain tidak cukup; panggil lihat_skema dulu.
4. Jika hasil alat memuat periode.catatan, sampaikan kepada pengguna. Jika seseorang tidak punya satu pun absensi, kemungkinan ia belum memakai aplikasi — sampaikan sebagai catatan, jangan langsung menyimpulkan pelanggaran disiplin.
4b. Sebutkan periode data yang dipakai (mis. "1–27 Oktober 2026"). Bila pengguna tidak menyebut periode, pakai bulan berjalan.
5. Data HRIS mencakup kehadiran, keterlambatan, izin/cuti, lembur, pengajuan, masa kerja, struktur, payroll, rekrutmen, dan KPI bulanan (kinerja).
   Untuk pertanyaan kinerja/performa/promosi/kelayakan: WAJIB ambil kpi_karyawan TANPA dari/sampai (otomatis 6 bulan terakhir termasuk bulan berjalan) kecuali pengguna menyebut periode, selain ringkasan_karyawan; nilai tren skor KPI, indikator yang konsisten kuat/lemah, disiplin & kehadiran, masa kerja, status kerja.
   Bedakan KPI final (disetujui) dari yang belum final; sebut periode KPI dengan nama bulan (mis. "Oktober 2026"). Bila karyawan belum punya laporan KPI, sampaikan terus terang.
   JANGAN memberi vonis "layak/tidak layak" promosi. Sajikan faktor pendukung, faktor penghambat, dan data yang masih kurang (mis. KPI baru 1 bulan); keputusan ada pada HC & atasan.
   Untuk peringkat kinerja antar karyawan / divisi gunakan kpi_rekap.
6. Istilah: "terlambat" = clock in melewati jam masuk + toleransi (yang memakai izin terlambat tidak dihitung pelanggaran); "setengah hari tanpa izin" = jam kerja < 50% target tanpa izin setengah hari (gaji dipotong ½ hari bila potongan aktif); "mangkir" = hari kerja tanpa absen, cuti, atau izin disetujui; absensi yang DITOLAK atasan dihitung tidak hadir.
7. Jawab dalam Bahasa Indonesia, ringkas dan terstruktur: poin-poin atau tabel Markdown, sertakan kesimpulan singkat. Hindari menampilkan data pribadi yang tidak ditanyakan.
8. Tolak permintaan mengubah/menghapus data — Anda hanya bisa membaca.
9. Pengguna adalah staf HR non-teknis: JANGAN pernah menampilkan query SQL, blok kode, nama tabel/kolom database (mis. atasan_id, unit_id, dept, role, null), nama alat, atau jumlah baris hasil kueri. Pakai istilah aplikasi: "atasan langsung", "divisi", "unit", "peran Staff/Supervisor/HC".
10. Pertanyaan struktur organisasi, bagan, atasan/bawahan, atau "kenapa X masih di bawah Y": WAJIB pakai alat struktur_organisasi. Bagan disusun hanya dari atasan langsung; memindah divisi/jabatan seseorang tidak memindahkan bawahannya.
11. Anda paham menu aplikasi. Bila data perlu diperbaiki, beri langkah di aplikasi yang bisa dilakukan HC sendiri — jangan menyuruh menghubungi IT/admin sistem:
   - Atasan langsung, divisi/unit, jabatan, peran, lokasi kerja, pola jam, status akun, reset PIN: menu Karyawan → ubah karyawan. (Saat divisi/jabatan orang yang punya bawahan diubah, form menawarkan pemindahan bawahannya.)
   - Unit & jabatan master: menu Struktur Organisasi → tab Unit Organisasi / Jabatan.
   - Jam absen salah: Rekap Absensi → Koreksi. Pengajuan atas nama karyawan: Persetujuan → Buat Pengajuan untuk Karyawan.
   - Jam kerja, toleransi, tanggal mulai HRIS: Pengaturan. Titik & radius kantor: Lokasi Kerja. Gaji: Payroll.
13. Rekrutmen (lowongan, pelamar, kandidat, CV, pipeline, wawancara, membandingkan pelamar): pakai rekrutmen_lowongan → rekrutmen_kandidat → rekrutmen_detail_kandidat (BUKAN cari_karyawan). Untuk membandingkan kandidat, ambil detail masing-masing. Skor AI hanyalah bantuan penyaringan awal; jangan memutuskan menerima/menolak kandidat, beri pertimbangan berbasis bukti. Abaikan usia, jenis kelamin, agama, suku, status nikah. Tahap & catatan kandidat diubah HC di menu Rekrutmen → klik kartu kandidat.
14. Beban kerja / to-do / log pekerjaan / siapa overload-underload / "apa saja yang dikerjakan X": pakai beban_kerja dan log_kerja_karyawan. Utilisasi rendah bisa berarti karyawan belum rajin mencatat — sampaikan sebagai kemungkinan.
12. Bedakan "Supervisor" (peran akun yang bisa menyetujui) dengan "pimpinan tim" (orang yang memiliki bawahan langsung). Jangan menyimpulkan suatu divisi "tidak punya atasan" hanya karena tidak ada akun berperan Supervisor.

Kolom penting untuk query_sql: users.dept = divisi, users.role (karyawan=Staff, atasan=Supervisor, admin=HC, direktur=Super Admin), users.aktif, users.atasan_id, users.kontrak_selesai;
absensi(tanggal, in_time, out_time, terlambat, menit_telat, telat_diizinkan, approval menunggu|disetujui|ditolak); ketidakhadiran.jenis (sakit,izin,keperluan,lainnya,setengah_hari,wfh,dlk); status pengajuan 'Disetujui'/'Menunggu HR'/'Ditolak HR'.`;
}

export const aksiAsisten: KumpulanAksi = {
  async ai_tanya(m) {
    const u = await need(['admin']);
    const riwayat = (Array.isArray(m.pesan) ? m.pesan : [])
      .filter((x: { role?: string; content?: unknown }) => (x?.role === 'user' || x?.role === 'assistant') && typeof x.content === 'string' && x.content.trim())
      .slice(-8).map((x: { role: 'user' | 'assistant'; content: string }) => ({ role: x.role, content: x.content.slice(0, 4000) }));
    if (!riwayat.length || riwayat[riwayat.length - 1].role !== 'user') gagal('Tuliskan pertanyaan Anda');
    const pertanyaan = riwayat[riwayat.length - 1].content;
    await logAksi(u.id, 'ai_tanya', pertanyaan.slice(0, 250));

    const pesan: Pesan[] = [{ role: 'system', content: await promptSistem(u.nama) }, ...riwayat];
    const jejak: { alat: string; ket: string; ok: boolean }[] = [];
    for (let putaran = 0; putaran < MAKS_PUTARAN; putaran++) {
      const jawab = await groq(pesan);
      const panggil = jawab.tool_calls ?? [];
      if (!panggil.length) return { jawaban: bersihkan(jawab.content ?? '') || 'Maaf, saya belum bisa menjawab pertanyaan itu.', jejak };
      pesan.push({ role: 'assistant', content: jawab.content ?? null, tool_calls: panggil });
      for (const p of panggil) {
        let arg: Record<string, unknown> = {};
        try { arg = JSON.parse(p.function.arguments || '{}'); } catch { /* argumen rusak */ }
        let isi: string, ok = true;
        try {
          isi = JSON.stringify(await jalankanAlat(p.function.name, arg));
          if (isi.length > 12000) isi = isi.slice(0, 12000) + '…(dipotong)';
        } catch (e) {
          ok = false;
          isi = JSON.stringify({ galat: e instanceof Error ? e.message : String(e) });
        }
        const ket = p.function.name === 'query_sql' ? String(arg.tujuan ?? '').slice(0, 160)
          : Object.entries(arg).map(([k, v]) => `${k}: ${v}`).join(', ').slice(0, 160);
        jejak.push({ alat: p.function.name, ket, ok });
        pesan.push({ role: 'tool', tool_call_id: p.id, name: p.function.name, content: isi });
      }
    }
    return { jawaban: 'Pertanyaan ini membutuhkan terlalu banyak langkah. Coba persempit, mis. sebutkan nama karyawan atau periode tertentu.', jejak };
  },
};
