/* KPI & KBI: atasan / HC mengisi realisasi bulanan → atasan memverifikasi (arahan HC 17 Nov 2026); HC mengelola template,
   recap KPI–KBI–insentif per bulan. Karyawan hanya melihat KPI-nya. */
import { exec, q, q1, sisipkan, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { cakupanTim, inList, isAdminUp, labelPenyetuju, logAksi, need, pastikanDalamCakupan, type User } from '@/lib/aturan';
import { beriTahu, penyetujuUntuk } from '@/lib/notifikasi';
import { ambangInsentif, cekPeriode, detailLapor, INSENTIF_BAWAAN, jabatanTemplate, pastikanLapor, periodeKini, predikat, salinIndikator, segarkanLapor, simpanIsian, SATUAN_SUMBER, SUMBER_OTOMATIS, templateUntuk } from '@/lib/kpi';
import { setSetting } from '@/lib/pengaturan';
import type { KumpulanAksi } from '../daftar';

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const bulanTeks = (p: string) => `${NAMA_BULAN[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;

async function laporAda(id: number) {
  const l = await q1('SELECT * FROM kpi_lapor WHERE id=?', [id]);
  if (!l) gagal('Laporan KPI tidak ditemukan', 404);
  return l;
}
/* hak lihat: pemilik, HC/Super Admin, atau Supervisor yang membawahinya */
async function bolehLihat(u: User, pemilik: number) {
  if (pemilik === u.id || isAdminUp(u)) return;
  const ids = await cakupanTim(u);
  if (ids !== null && !ids.includes(pemilik)) gagal('Karyawan ini bukan anggota tim Anda', 403);
}

/* atasan penilai: atasan (Supervisor) atau direktur pada rantai atasan karyawan. Bila tidak ada, HC yang memverifikasi. */
async function atasanPenilai(uid: number): Promise<number[]> {
  const semua = await q('SELECT id, atasan_id, role, aktif FROM users');
  const peta = new Map(semua.map((x) => [x.id as number, x]));
  const hasil: number[] = [];
  for (let a = peta.get(uid)?.atasan_id, n = 0; a && n < 50; a = peta.get(a)?.atasan_id, n++) {
    const x = peta.get(a);
    if (x && x.aktif === 1 && (x.role === 'atasan' || x.role === 'direktur') && x.id !== uid) hasil.push(x.id);
  }
  return hasil;
}
async function bolehSetujui(u: User, pemilik: number): Promise<boolean> {
  if (pemilik === u.id) return false;
  const p = await atasanPenilai(pemilik);
  return p.length ? p.includes(u.id) : isAdminUp(u);
}
async function penerimaVerifikasi(pemilik: number): Promise<number[]> {
  const p = await atasanPenilai(pemilik);
  return p.length ? p.slice(0, 1) : (await q("SELECT id FROM users WHERE aktif=1 AND role IN ('admin','direktur')")).map((x) => x.id as number);
}

export const aksiKpi: KumpulanAksi = {
  /* ================= KARYAWAN ================= */
  async kpi_saya(m) {
    const u = await need();
    if (u.role === 'direktur') gagal('Akun Super Admin tidak memiliki KPI');
    const periode = cekPeriode(s(m, 'periode') || periodeKini());
    const ambilRiwayat = async () => (await q("SELECT periode, skor, predikat, status FROM kpi_lapor WHERE user_id=? ORDER BY periode DESC LIMIT 12", [u.id]))
      .map((r) => ({ periode: r.periode, skor: r.skor == null ? null : Number(r.skor), predikat: r.predikat, status: r.status }));
    const l = await pastikanLapor(u, periode);
    if (!l) return { kosong: true, periode, riwayat: await ambilRiwayat() };
    await segarkanLapor(l.id);   // hitung ulang dulu agar riwayat memuat skor terbaru
    return { kosong: false, periode, lapor: await detailLapor(l.id), riwayat: await ambilRiwayat() };
  },

  /* karyawan tidak lagi mengisi sendiri: KPI & KBI diisi atasan / HC */
  async kpi_simpan() {
    await need();
    gagal('KPI dan KBI Anda diisi oleh atasan / HC, lalu diverifikasi atasan. Anda dapat melihat hasilnya di halaman ini.', 403);
  },

  /* ================= SUPERVISOR (timnya) & HC ================= */
  async kpi_tim(m) {
    const u = await need();
    const tim = await cakupanTim(u);
    const periode = cekPeriode(s(m, 'periode') || periodeKini());
    const users = await q(`SELECT * FROM users WHERE aktif=1 AND role<>'direktur' AND id<>?${tim === null ? '' : ` AND id IN (${inList(tim)})`} ORDER BY nama`, [u.id]);
    const lapor = new Map((await q(`SELECT * FROM kpi_lapor WHERE periode=? AND user_id IN (${inList(users.map((x) => x.id))})`, [periode])).map((x) => [x.user_id, x]));
    const baris = [];
    for (const k of users) {
      const l = lapor.get(k.id), t = l ? null : await templateUntuk(k);
      baris.push({ userId: k.id, nama: k.nama, nik: k.nik, jabatan: k.jabatan, dept: k.dept, laporId: l?.id ?? null, template: l?.template_nama ?? t?.nama ?? '',
        status: l?.status ?? (t ? 'belum' : 'tanpa'), skor: l?.skor == null ? null : Number(l.skor), predikat: l?.predikat ?? '', diajukan: l?.diajukan_at ?? null,
        skorKbi: l?.skor_kbi == null ? null : Number(l.skor_kbi) });
    }
    const final = baris.filter((x) => x.status === 'disetujui' && x.skor != null);
    return { periode, admin: isAdminUp(u), baris,
      stat: { menunggu: baris.filter((x) => x.status === 'diajukan').length, disetujui: final.length, belum: baris.filter((x) => ['belum', 'draf', 'dikembalikan'].includes(x.status)).length,
        tanpa: baris.filter((x) => x.status === 'tanpa').length, rata: final.length ? Math.round((final.reduce((a, x) => a + (x.skor ?? 0), 0) / final.length) * 10) / 10 : null } };
  },

  async kpi_detail(m) {
    const u = await need();
    const pemilik = await q1('SELECT * FROM users WHERE id=?', [i(m, 'userId')]);
    if (!pemilik) gagal('Karyawan tidak ditemukan');
    await bolehLihat(u, pemilik.id);
    const periode = cekPeriode(s(m, 'periode') || periodeKini());
    const l = await pastikanLapor(pemilik, periode);
    if (!l) gagal(`${pemilik.nama} belum memiliki template KPI. Atur di tab Template (jabatan "${pemilik.jabatan || '-'}").`);
    await segarkanLapor(l.id);
    const riwayat = (await q('SELECT periode, skor, predikat, status FROM kpi_lapor WHERE user_id=? ORDER BY periode DESC LIMIT 12', [pemilik.id]))
      .map((r) => ({ periode: r.periode, skor: r.skor == null ? null : Number(r.skor), predikat: r.predikat, status: r.status }));
    return { lapor: await detailLapor(l.id), riwayat, bolehVerifikasi: pemilik.id !== u.id, bolehSetujui: await bolehSetujui(u, pemilik.id), admin: isAdminUp(u) };
  },

  async kpi_verifikasi(m) {
    const u = await need();
    const l = await laporAda(i(m, 'id'));
    await pastikanDalamCakupan(u, l.user_id);
    const keputusan = s(m, 'keputusan', 'simpan');
    if (!['simpan', 'ajukan', 'setujui', 'kembalikan'].includes(keputusan)) gagal('Keputusan tidak sah');
    if (l.status === 'disetujui') gagal('KPI bulan ini sudah final. HC dapat membukanya kembali bila perlu koreksi.');
    const penilai = await bolehSetujui(u, l.user_id);
    if ((keputusan === 'setujui' || keputusan === 'kembalikan') && !penilai) gagal('Verifikasi KPI dilakukan oleh atasan karyawan ini', 403);
    if (keputusan !== 'kembalikan') await simpanIsian(l.id, m.nilai, true);
    const catatan = s(m, 'catatan').slice(0, 1000);
    await segarkanLapor(l.id);
    const k = await q1('SELECT id, nama FROM users WHERE id=?', [l.user_id]);
    const kosongan = async () => {
      const kosong = await q("SELECT nama FROM kpi_nilai WHERE lapor_id=? AND sumber='manual' AND realisasi IS NULL", [l.id]);
      if (kosong.length) gagal('Masih ada indikator tanpa realisasi: ' + kosong.map((x) => x.nama).join(', '));
    };
    if (keputusan === 'simpan') {
      if (catatan) await exec('UPDATE kpi_lapor SET catatan=? WHERE id=?', [catatan, l.id]);
      return { pesan: 'Isian KPI tersimpan' };
    }
    if (keputusan === 'ajukan') {
      await kosongan();
      await exec("UPDATE kpi_lapor SET status='diajukan', diajukan_at=NOW(), catatan=? WHERE id=?", [catatan, l.id]);
      await logAksi(u.id, 'ajukan_kpi', `${k?.nama} ${l.periode}`);
      await beriTahu(penerimaVerifikasi(l.user_id), { jenis: 'kpi', tautan: '/kelola-kpi', judul: `KPI ${k?.nama} menunggu verifikasi`, isi: `KPI & KBI ${bulanTeks(l.periode)} sudah diisi ${u.nama}.` });
      return { pesan: 'KPI diajukan ke atasan untuk diverifikasi' };
    }
    if (keputusan === 'kembalikan') {
      if (l.status !== 'diajukan') gagal('Hanya KPI yang sedang diajukan yang bisa dikembalikan');
      if (!catatan) gagal('Tuliskan apa yang perlu diperbaiki');
      await exec("UPDATE kpi_lapor SET status='dikembalikan', catatan_verifikator=?, diverifikasi_oleh=?, diverifikasi_at=NOW() WHERE id=?", [catatan, labelPenyetuju(u), l.id]);
      await logAksi(u.id, 'kembalikan_kpi', `${k?.nama} ${l.periode}`);
      await beriTahu((await q("SELECT id FROM users WHERE aktif=1 AND role='admin'")).map((x) => x.id as number),
        { jenis: 'kpi', tautan: '/kelola-kpi', judul: `KPI ${k?.nama} ${bulanTeks(l.periode)} dikembalikan`, isi: catatan.slice(0, 200) });
      return { pesan: 'KPI dikembalikan untuk diperbaiki' };
    }
    await kosongan();
    const f = await q1('SELECT skor, skor_kbi FROM kpi_lapor WHERE id=?', [l.id]);
    const skor = Number(f?.skor ?? 0);
    await exec("UPDATE kpi_lapor SET status='disetujui', predikat=?, catatan_verifikator=?, diverifikasi_oleh=?, diverifikasi_at=NOW(), diajukan_at=IFNULL(diajukan_at,NOW()) WHERE id=?",
      [predikat(skor), catatan, labelPenyetuju(u), l.id]);
    await logAksi(u.id, 'setujui_kpi', `${k?.nama} ${l.periode} skor ${skor}`);
    const kbiTeks = f?.skor_kbi == null ? '' : ` · KBI ${Number(f.skor_kbi).toFixed(1)}`;
    await beriTahu([l.user_id], { jenis: 'kpi', tautan: '/kpi', judul: `KPI ${bulanTeks(l.periode)} disetujui`, isi: `KPI ${skor.toFixed(1)} · ${predikat(skor)}${kbiTeks}` });
    return { pesan: `KPI disetujui · skor ${skor.toFixed(1)} (${predikat(skor)})${kbiTeks}` };
  },

  /* HC: buka kembali KPI final untuk koreksi, atau muat ulang indikator dari template terbaru */
  async kpi_buka(m) {
    const u = await need(['admin']);
    const l = await laporAda(i(m, 'id'));
    if (l.status !== 'disetujui') gagal('Hanya KPI yang sudah final yang bisa dibuka kembali');
    const alasan = s(m, 'alasan');
    if (!alasan) gagal('Tuliskan alasan membuka kembali');
    await exec("UPDATE kpi_lapor SET status='diajukan', catatan_verifikator=? WHERE id=?", [('Dibuka kembali: ' + alasan).slice(0, 1000), l.id]);
    await logAksi(u.id, 'buka_kpi', `#${l.id} ${l.periode} — ${alasan}`);
    return { pesan: 'KPI dibuka kembali untuk dikoreksi' };
  },
  async kpi_muat_ulang(m) {
    const u = await need(['admin']);
    const l = await laporAda(i(m, 'id'));
    if (l.status === 'disetujui') gagal('KPI final tidak bisa dimuat ulang');
    const k = await q1('SELECT * FROM users WHERE id=?', [l.user_id]);
    const t = k ? await templateUntuk(k) : null;
    if (!t) gagal('Karyawan ini tidak lagi memiliki template KPI');
    await salinIndikator(l.id, t.id);
    await exec('UPDATE kpi_lapor SET template_id=?, template_nama=? WHERE id=?', [t.id, t.nama, l.id]);
    await segarkanLapor(l.id);
    await logAksi(u.id, 'muat_ulang_kpi', `#${l.id}`);
    return { pesan: 'Indikator diperbarui dari template terbaru (realisasi yang sudah diisi dipertahankan)' };
  },

  /* ================= TEMPLATE (HC) ================= */
  async kpi_template_daftar() {
    await need(['admin']);
    const t = await q('SELECT * FROM kpi_template ORDER BY aktif DESC, nama');
    const ind = await q('SELECT * FROM kpi_indikator ORDER BY urut, id');
    const users = await q("SELECT id, nama, jabatan, dept FROM users WHERE aktif=1 AND role<>'direktur' ORDER BY nama");
    const tugas = await q('SELECT p.user_id, p.template_id FROM kpi_penugasan p');
    const jabatan = [...new Set(users.map((x) => String(x.jabatan ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
    const cocok = (tpl: Baris) => {
      const j = jabatanTemplate(tpl).map((x) => x.toLowerCase());
      return users.filter((x) => tugas.some((p) => p.user_id === x.id) ? tugas.some((p) => p.user_id === x.id && p.template_id === tpl.id) : j.includes(String(x.jabatan ?? '').trim().toLowerCase())).length;
    };
    return {
      template: t.map((x) => ({ id: x.id, nama: x.nama, keterangan: x.keterangan, aktif: !!x.aktif, jabatan: jabatanTemplate(x), jumlahKaryawan: cocok(x),
        indikator: ind.filter((y) => y.template_id === x.id).map((y) => ({ id: y.id, jenis: y.jenis, kelompok: y.kelompok, nama: y.nama, deskripsi: y.deskripsi, satuan: y.satuan, target: Number(y.target),
          bobot: Number(y.bobot), arah: y.arah, sumber: y.sumber })) })),
      jabatan, karyawan: users.map((x) => ({ id: x.id, nama: x.nama, jabatan: x.jabatan, dept: x.dept, templateKhusus: tugas.find((p) => p.user_id === x.id)?.template_id ?? null })),
    };
  },

  async kpi_template_simpan(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), nama = s(m, 'nama');
    if (nama.length < 3) gagal('Nama template wajib diisi');
    const jabatan = (Array.isArray(m.jabatan) ? m.jabatan : []).map((x: unknown) => String(x).trim()).filter(Boolean);
    const ind = Array.isArray(m.indikator) ? m.indikator as Baris[] : [];
    if (!ind.some((x) => x.jenis !== 'kbi')) gagal('Tambahkan minimal satu indikator KPI');
    if (ind.length > 30) gagal('Maksimal 30 indikator (KPI + KBI) per template');
    const bersih = ind.map((x, n) => {
      const kelompok = String(x.kelompok ?? '').trim().slice(0, 150);
      if (x.jenis === 'kbi') {
        // KBI: skor perilaku 1–5, diisi atasan, tanpa bobot
        const namaInd = String(x.nama ?? '').trim(), target = Number(x.target);
        if (!namaInd) gagal(`Nama indikator KBI ke-${n + 1} wajib diisi`);
        if (!Number.isFinite(target) || target < 1 || target > 5) gagal(`Skor target KBI "${namaInd}" harus 1 sampai 5`);
        return { id: Number(x.id) || 0, jenis: 'kbi', kelompok, nama: namaInd.slice(0, 150), deskripsi: String(x.deskripsi ?? '').trim().slice(0, 500), satuan: 'skor',
          target, bobot: 0, arah: 'naik', sumber: 'manual', urut: n };
      }
      const sumber = ['manual', ...SUMBER_OTOMATIS].includes(x.sumber) ? x.sumber : 'manual';
      const arah = SUMBER_OTOMATIS.includes(sumber) ? 'naik' : ['naik', 'turun', 'ya_tidak'].includes(x.arah) ? x.arah : 'naik';
      const namaInd = String(x.nama ?? '').trim();
      if (!namaInd) gagal(`Nama indikator ke-${n + 1} wajib diisi`);
      // kehadiran & tepat waktu selalu bertarget 100%; indikator log kerja targetnya diatur HC
      const bobot = Number(x.bobot), target = arah === 'ya_tidak' ? 1 : ['kehadiran', 'tepat_waktu'].includes(sumber) ? 100 : Number(x.target);
      if (!Number.isFinite(bobot) || bobot <= 0) gagal(`Bobot "${namaInd}" harus lebih dari 0`);
      if (!Number.isFinite(target) || target <= 0) gagal(`Target "${namaInd}" harus lebih dari 0`);
      return { id: Number(x.id) || 0, jenis: 'kpi', kelompok, nama: namaInd.slice(0, 150), deskripsi: String(x.deskripsi ?? '').trim().slice(0, 500),
        satuan: SUMBER_OTOMATIS.includes(sumber) ? SATUAN_SUMBER[sumber] : arah === 'ya_tidak' ? 'ya/tidak' : String(x.satuan ?? '').trim().slice(0, 30), target, bobot, arah, sumber, urut: n };
    });
    const total = bersih.filter((x) => x.jenis === 'kpi').reduce((a, x) => a + x.bobot, 0);
    if (Math.abs(total - 100) > 0.01) gagal(`Total bobot indikator KPI harus 100% (sekarang ${Math.round(total * 100) / 100}%)`);
    const data = { nama: nama.slice(0, 120), jabatan: JSON.stringify(jabatan), keterangan: s(m, 'keterangan').slice(0, 500), aktif: m.aktif === false ? 0 : 1 };
    let tid = id;
    if (id) {
      const r = await exec('UPDATE kpi_template SET nama=?, jabatan=?, keterangan=?, aktif=? WHERE id=?', [data.nama, data.jabatan, data.keterangan, data.aktif, id]);
      if (!r.affectedRows) gagal('Template tidak ditemukan');
    } else tid = await sisipkan('kpi_template', data);
    const lama = (await q('SELECT id FROM kpi_indikator WHERE template_id=?', [tid])).map((x) => x.id as number);
    const dipakai = new Set<number>();
    for (const x of bersih) {
      const isi = { jenis: x.jenis, kelompok: x.kelompok, nama: x.nama, deskripsi: x.deskripsi, satuan: x.satuan, target: x.target, bobot: x.bobot, arah: x.arah, sumber: x.sumber, urut: x.urut };
      if (x.id && lama.includes(x.id)) { await exec(`UPDATE kpi_indikator SET ${Object.keys(isi).map((c) => `${c}=:${c}`).join(',')} WHERE id=:__id`, { ...isi, __id: x.id }); dipakai.add(x.id); }
      else await sisipkan('kpi_indikator', { ...isi, template_id: tid });
    }
    const hapus = lama.filter((x) => !dipakai.has(x));
    if (hapus.length) await exec(`DELETE FROM kpi_indikator WHERE id IN (${inList(hapus)})`);
    await logAksi(u.id, id ? 'ubah_template_kpi' : 'tambah_template_kpi', nama);
    return { pesan: 'Template KPI tersimpan. Berlaku untuk laporan bulan yang belum dibuat; laporan bulan berjalan bisa dimuat ulang dari detailnya.', id: tid };
  },

  async kpi_template_hapus(m) {
    const u = await need(['admin']);
    const t = await q1('SELECT * FROM kpi_template WHERE id=?', [i(m, 'id')]);
    if (!t) gagal('Template tidak ditemukan');
    await exec('DELETE FROM kpi_template WHERE id=?', [t.id]);   // laporan lama tetap utuh (indikator sudah disalin)
    await logAksi(u.id, 'hapus_template_kpi', t.nama);
    return { pesan: 'Template dihapus. Laporan KPI bulan-bulan sebelumnya tetap tersimpan.' };
  },

  /* Recap KPI, KBI, insentif per karyawan per bulan (tahun KPI Juli–Juni), seperti sheet Recap manual HC */
  async kpi_recap(m) {
    await need(['admin']);
    const kini = periodeKini(), [th, bl] = kini.split('-').map(Number);
    const awalTh = Number(s(m, 'tahun')) || (bl >= 7 ? th : th - 1);
    if (awalTh < 2020 || awalTh > 2100) gagal('Tahun tidak sah');
    const bulan: string[] = [];
    for (let n = 0; n < 12; n++) { const b = 7 + n, y = awalTh + Math.floor((b - 1) / 12), mm = ((b - 1) % 12) + 1; bulan.push(`${y}-${String(mm).padStart(2, '0')}`); }
    const lapor = await q(`SELECT l.user_id, l.periode, l.skor, l.skor_kbi, l.insentif, l.status, l.sumber_data FROM kpi_lapor l WHERE l.periode BETWEEN ? AND ?`, [bulan[0], bulan[11]]);
    const ids = [...new Set(lapor.map((x) => x.user_id as number))];
    const users = await q(`SELECT id, nik, nama, dept, jabatan, aktif FROM users WHERE role<>'direktur' AND (aktif=1${ids.length ? ` OR id IN (${inList(ids)})` : ''}) ORDER BY dept, nama`);
    const per = new Map<string, Baris>(lapor.map((x) => [x.user_id + '|' + x.periode, x]));
    const angka = (v: unknown) => (v == null ? null : Number(v));
    return { tahun: awalTh, bulan, ambang: await ambangInsentif(),
      baris: users.map((u) => ({ userId: u.id, nik: u.nik, nama: u.nama, divisi: u.dept, jabatan: u.jabatan, aktif: u.aktif === 1,
        bulan: Object.fromEntries(bulan.map((p) => { const x = per.get(u.id + '|' + p); return [p, x ? { kpi: angka(x.skor), kbi: angka(x.skor_kbi), insentif: angka(x.insentif), status: x.status, migrasi: x.sumber_data === 'migrasi_recap' } : null]; })) })) };
  },
  async kpi_insentif_simpan(m) {
    const u = await need(['admin']);
    const a = Array.isArray(m.ambang) ? (m.ambang as unknown[]) : [];
    const bersih = a.map((x) => (Array.isArray(x) ? [Number(x[0]), Math.round(Number(x[1]))] : [NaN, NaN]) as [number, number]);
    if (!bersih.length || bersih.length > 8 || bersih.some(([b, rp]) => !Number.isFinite(b) || b < 0 || b > 200 || !Number.isFinite(rp) || rp < 0 || rp > 100000000))
      gagal('Ambang insentif tidak sah');
    bersih.sort((p, q2) => q2[0] - p[0]);
    await setSetting('kpi_insentif', JSON.stringify(bersih));
    await logAksi(u.id, 'ubah_insentif_kpi', JSON.stringify(bersih).slice(0, 200));
    return { pesan: 'Ambang insentif tersimpan. Berlaku untuk KPI yang belum final; KPI final dihitung ulang bila dibuka kembali.', ambang: bersih, bawaan: INSENTIF_BAWAAN };
  },

  async kpi_penugasan_simpan(m) {
    const u = await need(['admin']);
    const uid = i(m, 'userId'), tid = i(m, 'templateId');
    if (!(await q1('SELECT id FROM users WHERE id=?', [uid]))) gagal('Karyawan tidak ditemukan');
    if (tid) {
      if (!(await q1('SELECT id FROM kpi_template WHERE id=?', [tid]))) gagal('Template tidak ditemukan');
      await exec('INSERT INTO kpi_penugasan (user_id, template_id) VALUES (?,?) ON DUPLICATE KEY UPDATE template_id=VALUES(template_id)', [uid, tid]);
    } else await exec('DELETE FROM kpi_penugasan WHERE user_id=?', [uid]);
    await logAksi(u.id, 'penugasan_kpi', `#${uid} → ${tid || 'ikut jabatan'}`);
    return { pesan: tid ? 'Template khusus dipasang' : 'Kembali mengikuti template jabatan' };
  },
};

