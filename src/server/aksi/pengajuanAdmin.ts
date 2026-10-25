/* Pengajuan atas nama karyawan (HC / Super Admin): dipakai saat karyawan lupa mengajukan, mis. dinas luar kota
   atau penyelenggaraan kompetisi akhir pekan. Bisa untuk banyak karyawan & rentang tanggal sekaligus, langsung
   disetujui atau menunggu persetujuan biasa. Juga ubah & hapus pengajuan yang sudah ada. */
import { exec, q, q1, transaksi } from '@/lib/db';
import { b, gagal, i, s } from '@/lib/http';
import {
  cutiAktif, hitungHari, jadwalHari, labelJenis, labelKet, labelPenyetuju, logAksi, need, sisaCuti, terapkanSetengahHari,
} from '@/lib/aturan';
import { beriTahu } from '@/lib/notifikasi';
import { epoch, POLA_JAM, POLA_TGL, sekarangSql, tambahHari } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const JENIS_KET = ['dlk', 'wfh', 'sakit', 'izin', 'keperluan', 'lainnya', 'setengah_hari'];
const JENIS_CUTI = ['Cuti Tahunan', 'Cuti Penting', 'Cuti Melahirkan'];
const STATUS_KET = ['Menunggu HR', 'Disetujui', 'Ditolak HR', 'Dibatalkan'];
const STATUS_CUTI = ['Menunggu', 'Disetujui', 'Ditolak', 'Dibatalkan'];
const tglId = (t: string) => String(t).split('-').reverse().join('/');
const rentangTeks = (a: string, z: string) => tglId(a) + (z !== a ? ' – ' + tglId(z) : '');

export const aksiPengajuanAdmin: KumpulanAksi = {
  /* buat pengajuan untuk satu / banyak karyawan */
  async adm_buat_pengajuan(m) {
    const u = await need(['admin']);
    const jenis = s(m, 'jenis'), mulai = s(m, 'mulai'), sampaiMasukan = s(m, 'sampai') || mulai, alasan = s(m, 'alasan').slice(0, 255);
    const setuju = 'setujui' in m ? b(m, 'setujui') : true, termasukLibur = 'termasukLibur' in m ? b(m, 'termasukLibur') : jenis === 'dlk';
    const ids = [...new Set((Array.isArray(m.userIds) ? m.userIds : []).map(Number).filter((x: number) => Number.isInteger(x) && x > 0))].slice(0, 300) as number[];
    if (!ids.length) gagal('Pilih minimal satu karyawan');
    if (!POLA_TGL.test(mulai)) gagal('Tanggal mulai tidak sah');
    const sampai = jenis === 'setengah_hari' || jenis === 'izin_telat' ? mulai : sampaiMasukan;
    if (!POLA_TGL.test(sampai) || sampai < mulai) gagal('Tanggal selesai tidak sah');
    if ((epoch(sampai) - epoch(mulai)) / 86400 > 60) gagal('Rentang paling panjang 61 hari');
    const kategori = JENIS_KET.includes(jenis) ? 'ket' : JENIS_CUTI.includes(jenis) ? 'cuti' : jenis === 'izin_telat' ? 'telat' : '';
    if (!kategori) gagal('Jenis pengajuan tidak sah');
    const sesi = jenis === 'setengah_hari' ? s(m, 'sesi') : '';
    if (jenis === 'setengah_hari' && sesi !== 'pagi' && sesi !== 'siang') gagal('Pilih sesi pagi atau siang');
    const jam = s(m, 'jam');
    if (kategori === 'telat' && !POLA_JAM.test(jam)) gagal('Isi perkiraan jam tiba');
    if (jenis === 'dlk' && !alasan) gagal('Tuliskan tujuan / keperluan dinas');

    const pembuat = labelPenyetuju(u), karyawan = await q(`SELECT * FROM users WHERE id IN (${ids.join(',')}) AND aktif=1 AND role<>'direktur'`);
    const hasil: { nama: string; dibuat: number; dilewati: string[] }[] = [];
    await transaksi(async () => {
      for (const k of karyawan) {
        const r = { nama: k.nama, dibuat: 0, dilewati: [] as string[] };
        if (kategori === 'cuti') {
          const ada = await q1(`SELECT id FROM cuti WHERE user_id=? AND status IN ('Menunggu','Disetujui') AND mulai<=? AND selesai>=?`, [k.id, sampai, mulai]);
          const hari = await hitungHari(mulai, sampai, jenis);
          if (ada) r.dilewati.push('sudah ada cuti pada rentang ini');
          else if (hari < 1) r.dilewati.push('rentang hanya berisi hari libur');
          else if (jenis === 'Cuti Tahunan' && setuju && (!cutiAktif(k) || hari > (await sisaCuti(k)))) r.dilewati.push(cutiAktif(k) ? `sisa cuti tidak cukup (${await sisaCuti(k)} hari)` : 'belum berhak cuti tahunan');
          else {
            await exec(`INSERT INTO cuti (user_id,jenis,mulai,selesai,hari,alasan,status,approver,tgl_putusan,dibuat_oleh) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [k.id, jenis, mulai, sampai, hari, alasan || jenis, setuju ? 'Disetujui' : 'Menunggu', setuju ? pembuat : '', setuju ? sekarangSql() : null, pembuat]);
            r.dibuat = hari;
          }
        } else if (kategori === 'telat') {
          if (await q1(`SELECT id FROM pengajuan WHERE user_id=? AND tanggal=? AND jenis='izin_telat' AND status IN ('Menunggu HR','Disetujui')`, [k.id, mulai])) r.dilewati.push('sudah ada izin terlambat');
          else {
            await exec(`INSERT INTO pengajuan (user_id,jenis,tanggal,jam_mulai,alasan,status,approver,tgl_putusan,jadwal_sesudah,dibuat_oleh) VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [k.id, 'izin_telat', mulai, jam + ':00', alasan || 'Izin terlambat', setuju ? 'Disetujui' : 'Menunggu HR', setuju ? pembuat : '', setuju ? sekarangSql() : null, 'Perkiraan tiba ' + jam, pembuat]);
            if (setuju) await exec('UPDATE absensi SET telat_diizinkan=1 WHERE user_id=? AND tanggal=?', [k.id, mulai]);
            r.dibuat = 1;
          }
        } else {
          for (let t = mulai; t <= sampai; t = tambahHari(t, 1)) {
            if (!termasukLibur && mulai !== sampai && (await jadwalHari(k, t)).libur) continue;
            if (k.tgl_masuk && t < k.tgl_masuk) continue;
            if (await q1(`SELECT id FROM ketidakhadiran WHERE user_id=? AND tanggal=? AND status IN ('Menunggu Rekomendasi','Menunggu HR','Disetujui')`, [k.id, t])) {
              r.dilewati.push(tglId(t)); continue;
            }
            await exec(`INSERT INTO ketidakhadiran (user_id,tanggal,jenis,sesi,alasan,status,approver,tgl_putusan,dibuat_oleh) VALUES (?,?,?,?,?,?,?,?,?)`,
              [k.id, t, jenis, sesi, alasan, setuju ? 'Disetujui' : 'Menunggu HR', setuju ? pembuat : '', setuju ? sekarangSql() : null, pembuat]);
            if (setuju && jenis === 'setengah_hari') await terapkanSetengahHari(k.id, t, sesi);
            r.dibuat++;
          }
        }
        hasil.push(r);
      }
    });
    const label = kategori === 'ket' ? labelKet(jenis) : kategori === 'telat' ? labelJenis('izin_telat') : jenis;
    await logAksi(u.id, 'buat_pengajuan_karyawan', `${label} ${mulai}..${sampai} untuk ${hasil.filter((x) => x.dibuat).length} karyawan`);
    for (const k of karyawan) {
      const r = hasil.find((x) => x.nama === k.nama);
      if (!r?.dibuat) continue;
      await beriTahu([k.id], { jenis: 'approval', tautan: '/pengajuan', judul: `${label} dicatat untuk Anda`,
        isi: `${rentangTeks(mulai, sampai)} · dibuat ${pembuat}${setuju ? ' dan langsung disetujui' : ', menunggu persetujuan'}${alasan ? ' · ' + alasan : ''}` });
    }
    const jml = hasil.filter((x) => x.dibuat).length;
    return { hasil, pesan: jml ? `${label} dibuat untuk ${jml} karyawan${setuju ? ' (disetujui)' : ''}` : 'Tidak ada pengajuan baru — semua tanggal sudah tercatat' };
  },

  /* ---------- ubah & hapus ---------- */
  async adm_ket_ubah(m) {
    const u = await need(['admin']);
    const x = await q1('SELECT * FROM ketidakhadiran WHERE id=?', [i(m, 'id')]);
    if (!x) gagal('Data tidak ditemukan');
    const jenis = s(m, 'jenis', x.jenis), tanggal = s(m, 'tanggal', x.tanggal), status = s(m, 'status', x.status);
    const sesi = jenis === 'setengah_hari' ? s(m, 'sesi', x.sesi || 'pagi') : '';
    if (![...JENIS_KET, 'libur'].includes(jenis)) gagal('Jenis tidak sah');
    if (!POLA_TGL.test(tanggal)) gagal('Tanggal tidak sah');
    if (!STATUS_KET.includes(status) && status !== x.status) gagal('Status tidak sah');
    if (jenis === 'setengah_hari' && sesi !== 'pagi' && sesi !== 'siang') gagal('Pilih sesi pagi atau siang');
    if (tanggal !== x.tanggal && (await q1(`SELECT id FROM ketidakhadiran WHERE user_id=? AND tanggal=? AND id<>? AND status IN ('Menunggu Rekomendasi','Menunggu HR','Disetujui')`, [x.user_id, tanggal, x.id])))
      gagal('Karyawan ini sudah punya pengajuan pada tanggal tersebut');
    const putusBaru = status !== x.status && ['Disetujui', 'Ditolak HR'].includes(status);
    await exec(`UPDATE ketidakhadiran SET jenis=?, tanggal=?, sesi=?, alasan=?, status=?, catatan_hr=?${putusBaru ? ', approver=?, tgl_putusan=NOW()' : ''} WHERE id=?`,
      [jenis, tanggal, sesi, s(m, 'alasan', x.alasan).slice(0, 255), status, s(m, 'catatan', x.catatan_hr ?? '').slice(0, 255), ...(putusBaru ? [labelPenyetuju(u)] : []), x.id]);
    if (status === 'Disetujui' && jenis === 'setengah_hari') await terapkanSetengahHari(x.user_id, tanggal, sesi);
    await logAksi(u.id, 'ubah_ketidakhadiran', `#${x.id} ${labelKet(jenis)} ${tanggal} ${status}`);
    if (status !== x.status || jenis !== x.jenis || tanggal !== x.tanggal)
      await beriTahu([x.user_id], { jenis: 'approval', tautan: '/pengajuan', judul: `${labelKet(jenis)} Anda diperbarui HC`, isi: `${tglId(tanggal)} · status ${status.replace(' HR', '')} · ${labelPenyetuju(u)}` });
    return { pesan: 'Pengajuan diperbarui' };
  },
  async adm_ket_hapus(m) {
    const u = await need(['admin']);
    const x = await q1('SELECT k.*, u.nama, u.nik FROM ketidakhadiran k JOIN users u ON u.id=k.user_id WHERE k.id=?', [i(m, 'id')]);
    if (!x) gagal('Data tidak ditemukan');
    await exec('DELETE FROM ketidakhadiran WHERE id=?', [x.id]);
    await logAksi(u.id, 'hapus_ketidakhadiran', `${x.nik} ${labelKet(x.jenis)} ${x.tanggal} (${x.status})`);
    return { pesan: `${labelKet(x.jenis)} ${x.nama} tanggal ${tglId(x.tanggal)} dihapus` };
  },
  async adm_cuti_ubah(m) {
    const u = await need(['admin']);
    const c = await q1('SELECT * FROM cuti WHERE id=?', [i(m, 'id')]);
    if (!c) gagal('Data tidak ditemukan');
    const jenis = s(m, 'jenis', c.jenis), mulai = s(m, 'mulai', c.mulai), selesai = s(m, 'selesai', c.selesai), status = s(m, 'status', c.status);
    if (!POLA_TGL.test(mulai) || !POLA_TGL.test(selesai) || selesai < mulai) gagal('Tanggal tidak sah');
    if (!STATUS_CUTI.includes(status)) gagal('Status tidak sah');
    const hari = await hitungHari(mulai, selesai, jenis);
    if (hari < 1) gagal('Rentang hanya berisi hari libur');
    if (status === 'Disetujui' && jenis === 'Cuti Tahunan') {
      const p = await q1('SELECT * FROM users WHERE id=?', [c.user_id]);
      // sisa dihitung tanpa cuti ini sendiri bila sebelumnya sudah disetujui
      const sisa = (await sisaCuti(p!)) + (c.status === 'Disetujui' && c.jenis === 'Cuti Tahunan' ? Number(c.hari) : 0);
      if (!cutiAktif(p!)) gagal('Karyawan belum berhak cuti tahunan');
      if (hari > sisa) gagal(`Sisa cuti tidak mencukupi (${sisa} hari)`);
    }
    const putusBaru = status !== c.status && ['Disetujui', 'Ditolak'].includes(status);
    await exec(`UPDATE cuti SET jenis=?, mulai=?, selesai=?, hari=?, alasan=?, status=?, catatan=?${putusBaru ? ', approver=?, tgl_putusan=NOW()' : ''} WHERE id=?`,
      [jenis, mulai, selesai, hari, s(m, 'alasan', c.alasan), status, s(m, 'catatan', c.catatan ?? ''), ...(putusBaru ? [labelPenyetuju(u)] : []), c.id]);
    await logAksi(u.id, 'ubah_cuti', `#${c.id} ${jenis} ${mulai}..${selesai} ${status}`);
    if (status !== c.status || mulai !== c.mulai || selesai !== c.selesai)
      await beriTahu([c.user_id], { jenis: 'approval', tautan: '/pengajuan', judul: `${jenis} Anda diperbarui HC`, isi: `${rentangTeks(mulai, selesai)} (${hari} hari) · status ${status} · ${labelPenyetuju(u)}` });
    return { pesan: 'Cuti diperbarui' };
  },
  async adm_cuti_hapus(m) {
    const u = await need(['admin']);
    const c = await q1('SELECT c.*, u.nama, u.nik FROM cuti c JOIN users u ON u.id=c.user_id WHERE c.id=?', [i(m, 'id')]);
    if (!c) gagal('Data tidak ditemukan');
    await exec('DELETE FROM cuti WHERE id=?', [c.id]);
    await logAksi(u.id, 'hapus_cuti', `${c.nik} ${c.jenis} ${c.mulai}..${c.selesai} (${c.status})`);
    return { pesan: `${c.jenis} ${c.nama} dihapus` };
  },
  async adm_pengajuan_hapus(m) {
    const u = await need(['admin']);
    const x = await q1('SELECT p.*, u.nama, u.nik FROM pengajuan p JOIN users u ON u.id=p.user_id WHERE p.id=?', [i(m, 'id')]);
    if (!x) gagal('Data tidak ditemukan');
    await exec('DELETE FROM pengajuan WHERE id=?', [x.id]);
    if (x.jenis === 'izin_telat' && x.status === 'Disetujui') await exec('UPDATE absensi SET telat_diizinkan=0 WHERE user_id=? AND tanggal=?', [x.user_id, x.tanggal]);
    await logAksi(u.id, 'hapus_pengajuan', `${x.nik} ${x.jenis} ${x.tanggal} (${x.status})`);
    return { pesan: `${labelJenis(x.jenis)} ${x.nama} dihapus` };
  },
};
