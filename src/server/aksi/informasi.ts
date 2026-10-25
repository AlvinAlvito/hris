/* Pengumuman, kalender libur, ulang tahun & ulang tahun kerja */
import { exec, q, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { logAksi, need } from '@/lib/aturan';
import { POLA_TGL, selisihHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';
import { beriTahu } from '@/lib/notifikasi';

function pengumumanRow(p: Baris, admin = false) {
  const r: Baris = {
    id: p.id, judul: p.judul, isi: p.isi, penting: p.penting === 1, cabangId: p.cabang_id, cabang: p.cnama ?? '',
    mulai: p.mulai, sampai: p.sampai, oleh: p.pembuat ?? '', tanggal: p.created_at,
    dibaca: p.dibaca === undefined ? null : !!Number(p.dibaca),
  };
  if (admin) { r.jumlahBaca = Number(p.jml_baca ?? 0); r.jumlahTarget = Number(p.jml_target ?? 0); }
  return r;
}
/* ulang tahun & ulang tahun kerja dalam N hari ke depan (melintasi akhir tahun) */
async function perayaanMendatang(hari: number) {
  const rows = await q("SELECT id, nama, jabatan, foto_profil, tgl_lahir, tgl_masuk FROM users WHERE aktif=1 AND role<>'direktur'");
  const hariIni = tglWIB(), th = Number(hariIni.slice(0, 4));
  const hasil: Baris[] = [];
  for (const r of rows) {
    for (const [jenis, tgl] of [['ultah', r.tgl_lahir], ['kerja', r.tgl_masuk]] as [string, string | null][]) {
      if (!tgl) continue;
      let kali = th - Number(tgl.slice(0, 4));
      let ini = th + tgl.slice(4);
      if (tgl.slice(5) === '02-29' && !(th % 4 === 0 && (th % 100 !== 0 || th % 400 === 0))) ini = th + '-03-01';
      if (ini < hariIni) { ini = th + 1 + tgl.slice(4); kali++; }
      const sel = selisihHari(hariIni, ini);
      if (sel > hari || (jenis === 'kerja' && kali < 1)) continue;
      hasil.push({ id: r.id, nama: r.nama, jabatan: r.jabatan, foto: r.foto_profil ? '/uploads/avatar/' + r.foto_profil : '',
        jenis, tanggal: ini, dalamHari: sel, ke: kali });
    }
  }
  return hasil.sort((a, b) => a.dalamHari - b.dalamHari);
}

export const aksiInfo: KumpulanAksi = {
  async info_beranda() {
    const u = await need();
    const peng = (await q(`SELECT p.*, c.nama cnama, x.nama pembuat, (b.user_id IS NOT NULL) dibaca
      FROM pengumuman p LEFT JOIN cabang c ON c.id=p.cabang_id LEFT JOIN users x ON x.id=p.dibuat_oleh
      LEFT JOIN pengumuman_baca b ON b.pengumuman_id=p.id AND b.user_id=?
      WHERE p.mulai<=CURDATE() AND (p.sampai IS NULL OR p.sampai>=CURDATE()) AND (p.cabang_id IS NULL OR p.cabang_id <=> ?)
      ORDER BY p.penting DESC, p.mulai DESC, p.id DESC LIMIT 20`, [u.id, u.cabang_id])).map((p) => pengumumanRow(p));
    const libur = await q('SELECT tanggal, nama, jenis FROM hari_libur WHERE tanggal>=CURDATE() ORDER BY tanggal LIMIT 6');
    return { pengumuman: peng, belumDibaca: peng.filter((p) => !p.dibaca).length, perayaan: await perayaanMendatang(14), liburMendatang: libur };
  },
  async info_baca(m) {
    const u = await need();
    await exec('INSERT IGNORE INTO pengumuman_baca (pengumuman_id, user_id) VALUES (?,?)', [i(m, 'id'), u.id]);
    return { ok: true };
  },
  async info_pengumuman() {
    await need(['admin']);
    const rows = await q(`SELECT p.*, c.nama cnama, x.nama pembuat,
      (SELECT COUNT(*) FROM pengumuman_baca b WHERE b.pengumuman_id=p.id) jml_baca,
      (SELECT COUNT(*) FROM users u WHERE u.aktif=1 AND u.role<>'direktur' AND (p.cabang_id IS NULL OR u.cabang_id=p.cabang_id)) jml_target
      FROM pengumuman p LEFT JOIN cabang c ON c.id=p.cabang_id LEFT JOIN users x ON x.id=p.dibuat_oleh ORDER BY p.id DESC LIMIT 100`);
    return rows.map((p) => pengumumanRow(p, true));
  },
  async info_pengumuman_simpan(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), judul = s(m, 'judul'), isi = s(m, 'isi');
    if (!judul || !isi) gagal('Judul dan isi pengumuman wajib diisi');
    const mulai = s(m, 'mulai', tglWIB()), sampai = s(m, 'sampai');
    for (const t of [mulai, sampai]) if (t !== '' && !POLA_TGL.test(t)) gagal('Tanggal tidak sah');
    if (sampai !== '' && sampai < mulai) gagal('Tanggal selesai tidak boleh sebelum tanggal mulai');
    const data = [judul.slice(0, 150), isi.slice(0, 5000), i(m, 'penting') ? 1 : 0, i(m, 'cabangId') || null, mulai, sampai || null];
    if (id) await exec('UPDATE pengumuman SET judul=?, isi=?, penting=?, cabang_id=?, mulai=?, sampai=? WHERE id=?', [...data, id]);
    else {
      await exec('INSERT INTO pengumuman (judul,isi,penting,cabang_id,mulai,sampai,dibuat_oleh) VALUES (?,?,?,?,?,?,?)', [...data, u.id]);
      const cab = i(m, 'cabangId') || null;
      const tujuan = (await q(`SELECT id FROM users WHERE aktif=1 AND id<>?${cab ? ' AND cabang_id=?' : ''}`, cab ? [u.id, cab] : [u.id])).map((x) => x.id as number);
      await beriTahu(tujuan, { jenis: 'pengumuman', tautan: '/informasi', judul: (i(m, 'penting') ? '📢 Penting: ' : 'Pengumuman: ') + judul.slice(0, 120), isi: isi.slice(0, 200) });
    }
    await logAksi(u.id, id ? 'ubah_pengumuman' : 'buat_pengumuman', judul);
    return { pesan: 'Pengumuman ' + (id ? 'diperbarui' : 'diterbitkan') };
  },
  async info_pengumuman_hapus(m) {
    const u = await need(['admin']);
    await exec('DELETE FROM pengumuman WHERE id=?', [i(m, 'id')]);
    await logAksi(u.id, 'hapus_pengumuman', '#' + i(m, 'id'));
    return { pesan: 'Pengumuman dihapus' };
  },
  async info_libur(m) {
    await need();
    const th = i(m, 'tahun', Number(tglWIB().slice(0, 4)));
    return (await q('SELECT * FROM hari_libur WHERE YEAR(tanggal)=? ORDER BY tanggal', [th]))
      .map((r) => ({ id: r.id, tanggal: r.tanggal, nama: r.nama, jenis: r.jenis }));
  },
  async info_libur_simpan(m) {
    const u = await need(['admin']);
    const tgl = s(m, 'tanggal'), nama = s(m, 'nama'), jenis = s(m, 'jenis', 'perusahaan');
    if (!POLA_TGL.test(tgl) || !nama) gagal('Tanggal dan nama libur wajib diisi');
    if (!['nasional', 'cuti_bersama', 'perusahaan'].includes(jenis)) gagal('Jenis libur tidak dikenal');
    await exec('INSERT INTO hari_libur (tanggal,nama,jenis) VALUES (?,?,?) ON DUPLICATE KEY UPDATE nama=VALUES(nama), jenis=VALUES(jenis)',
      [tgl, nama.slice(0, 120), jenis]);
    await logAksi(u.id, 'simpan_libur', tgl + ' ' + nama);
    return { pesan: 'Hari libur tersimpan' };
  },
  async info_libur_hapus(m) {
    const u = await need(['admin']);
    await exec('DELETE FROM hari_libur WHERE id=?', [i(m, 'id')]);
    await logAksi(u.id, 'hapus_libur', '#' + i(m, 'id'));
    return { pesan: 'Hari libur dihapus' };
  },
  async info_perayaan(m) {
    await need();
    return perayaanMendatang(Math.max(1, Math.min(60, i(m, 'hari', 30))));
  },
};
