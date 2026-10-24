/* Jadwal & shift: jadwal pegawai, jadwal rekan (untuk tukar), papan jadwal per lokasi, master shift, roster bulanan */
import { exec, q, q1, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { jadwalHari, logAksi, need, shiftById, shiftPublik, sudahAdaAbsensi } from '@/lib/aturan';
import { setg } from '@/lib/pengaturan';
import { tukarRow, userPublik } from '@/lib/format';
import { epoch, hariIso, POLA_JAM, POLA_TGL, tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

/* tanggal pertama & terakhir sebuah bulan */
function rentangBulan(m: Record<string, any>) {
  const kini = tglWIB();
  const bl = Math.max(1, Math.min(12, i(m, 'bulan', Number(kini.slice(5, 7))))), th = i(m, 'tahun', Number(kini.slice(0, 4)));
  const awal = `${th}-${String(bl).padStart(2, '0')}-01`;
  const akhir = tambahHari(bl === 12 ? `${th + 1}-01-01` : `${th}-${String(bl + 1).padStart(2, '0')}-01`, -1);
  return { awal, akhir };
}

export const aksiJadwal: KumpulanAksi = {
  async jadwal_saya(m) {
    const u = await need();
    const { awal, akhir } = rentangBulan(m);
    const hari = [];
    for (let t = awal; t <= akhir; t = tambahHari(t, 1)) {
      const j = await jadwalHari(u, t);
      hari.push({ tanggal: t, dow: hariIso(t), libur: j.libur, shift: j.shift ? shiftPublik(j.shift) : null, sumber: j.sumber,
        sudahAbsen: await sudahAdaAbsensi(u.id, t) });
    }
    // rekan satu lokasi kerja (untuk mencari partner tukar)
    const rekan = await q(`SELECT id,nik,nama,jabatan FROM users WHERE cabang_id <=> ? AND id<>? AND aktif=1 AND role<>'direktur'
      AND jam_mode='shift' ORDER BY nama`, [u.cabang_id, u.id]);
    const tukar = await q(`SELECT t.*, p.nama pemohon_nama, r.nama rekan_nama FROM tukar_jadwal t
      JOIN users p ON p.id=t.pemohon_id JOIN users r ON r.id=t.rekan_id WHERE t.pemohon_id=? OR t.rekan_id=? ORDER BY t.id DESC LIMIT 50`, [u.id, u.id]);
    return {
      me: await userPublik(u), awal, akhir, hari,
      jamKantor: { masuk: await setg('jam_masuk', '08:00'), pulang: await setg('jam_pulang', '17:00') },
      rekan: rekan.map((x) => ({ id: x.id, nik: x.nik, nama: x.nama, jabatan: x.jabatan })), tukar: tukar.map(tukarRow),
    };
  },
  async jadwal_rekan(m) {
    const u = await need();
    const rid = i(m, 'rekanId');
    const r = await q1('SELECT * FROM users WHERE id=? AND aktif=1', [rid]);
    if (!r) gagal('Rekan tidak ditemukan');
    if (r.cabang_id !== u.cabang_id) gagal('Rekan berbeda lokasi kerja');
    const { awal, akhir } = rentangBulan(m), hariIni = tglWIB();
    const hari = [];
    for (let t = awal; t <= akhir; t = tambahHari(t, 1)) {
      if (t < hariIni) continue;
      const j = await jadwalHari(r, t);
      hari.push({ tanggal: t, libur: j.libur, shift: j.shift ? j.shift.nama : '', sudahAbsen: await sudahAdaAbsensi(rid, t) });
    }
    return { rekan: { id: r.id, nama: r.nama }, hari };
  },

  /* papan jadwal satu tanggal, dikelompokkan per lokasi kerja & shift */
  async adm_jadwal_toko(m) {
    await need(['admin']);
    let tgl = s(m, 'tanggal', tglWIB());
    if (!POLA_TGL.test(tgl)) tgl = tglWIB();
    const cid = i(m, 'cabangId');
    const users = await q(`SELECT u.*, c.nama cnama, c.tipe ctipe FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id
      WHERE u.role<>'direktur' AND u.aktif=1${cid ? ' AND u.cabang_id=?' : ''} ORDER BY c.nama, u.nama`, cid ? [cid] : []);
    const toko = new Map<string, Baris>();
    for (const x of users) {
      const j = await jadwalHari(x, tgl), key = x.cnama || 'Tanpa lokasi';
      if (!toko.has(key)) toko.set(key, { nama: key, tipe: x.ctipe || '', shift: new Map<string, Baris>(), libur: [], lain: [] });
      const tk = toko.get(key)!;
      const item = { id: x.id, nama: x.nama, nik: x.nik, jabatan: x.jabatan, sudahAbsen: await sudahAdaAbsensi(x.id, tgl) };
      if (x.jam_mode === 'shift') {
        if (j.libur) tk.libur.push(item);
        else if (j.shift) {
          const nm = j.shift.nama;
          if (!tk.shift.has(nm)) tk.shift.set(nm, { nama: nm, jam: String(j.shift.jam_masuk).slice(0, 5) + '–' + String(j.shift.jam_pulang).slice(0, 5), orang: [] });
          tk.shift.get(nm).orang.push(item);
        } else tk.lain.push({ ...item, ket: 'belum dijadwalkan' });
      } else tk.lain.push({ ...item, ket: x.jam_mode === 'fleksibel' ? 'fleksibel' : 'jam tetap' });
    }
    return { tanggal: tgl, toko: [...toko.values()].map((t) => ({ ...t, shift: [...t.shift.values()] })) };
  },

  /* ---------- master shift ---------- */
  async adm_shift() {
    await need();
    return (await q('SELECT * FROM shift ORDER BY jam_masuk')).map(shiftPublik);
  },
  async adm_shift_save(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), nama = s(m, 'nama'), jm = s(m, 'jamMasuk'), jp = s(m, 'jamPulang');
    if (!nama) gagal('Nama shift wajib diisi');
    if (!POLA_JAM.test(jm) || !POLA_JAM.test(jp)) gagal('Jam shift tidak sah');
    const tol = Math.max(0, Math.min(180, i(m, 'toleransi', 10)));
    const lintas = epoch('2000-01-01', jp) <= epoch('2000-01-01', jm) ? 1 : 0;
    const aktif = i(m, 'aktif', 1) ? 1 : 0;
    if (await q1('SELECT id FROM shift WHERE LOWER(nama)=LOWER(?) AND id<>?', [nama, id])) gagal('Nama shift sudah dipakai');
    if (id) {
      await exec('UPDATE shift SET nama=?,jam_masuk=?,jam_pulang=?,toleransi=?,lintas_hari=?,aktif=? WHERE id=?', [nama, jm + ':00', jp + ':00', tol, lintas, aktif, id]);
      await logAksi(u.id, 'edit_shift', nama);
    } else {
      await exec('INSERT INTO shift (nama,jam_masuk,jam_pulang,toleransi,lintas_hari,aktif) VALUES (?,?,?,?,?,?)', [nama, jm + ':00', jp + ':00', tol, lintas, aktif]);
      await logAksi(u.id, 'tambah_shift', nama);
    }
    return { pesan: 'Shift tersimpan' + (lintas ? ' (terdeteksi shift lintas hari)' : '') };
  },
  async adm_shift_del(m) {
    const u = await need(['admin']);
    const id = i(m, 'id');
    if (Number((await q1('SELECT COUNT(*) n FROM users WHERE shift_id=?', [id]))?.n) > 0)
      gagal('Shift ini masih menjadi shift bawaan sejumlah karyawan. Ubah dulu di data karyawan.');
    if (Number((await q1('SELECT COUNT(*) n FROM jadwal_shift WHERE shift_id=? AND tanggal>=CURDATE()', [id]))?.n) > 0)
      gagal('Shift ini masih dipakai pada jadwal yang akan datang.');
    await exec('DELETE FROM shift WHERE id=?', [id]);
    await logAksi(u.id, 'hapus_shift', '#' + id);
    return { pesan: 'Shift dihapus' };
  },

  /* ---------- roster bulanan ---------- */
  async adm_jadwal(m) {
    await need(['admin']);
    const { awal, akhir } = rentangBulan(m), cid = i(m, 'cabangId');
    const users = await q(`SELECT u.*, c.nama cnama FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id
      WHERE u.role<>'direktur' AND u.aktif=1${cid ? ' AND u.cabang_id=?' : ''} ORDER BY c.nama, u.nama`, cid ? [cid] : []);
    const peta: Record<number, Record<string, number>> = {}, tukar: Record<number, Record<string, boolean>> = {};
    for (const j of await q('SELECT user_id, tanggal, shift_id, asal FROM jadwal_shift WHERE tanggal BETWEEN ? AND ?', [awal, akhir])) {
      (peta[j.user_id] ??= {})[j.tanggal] = j.shift_id ?? 0;      // 0 = libur
      if ((j.asal ?? 'manual') === 'tukar') (tukar[j.user_id] ??= {})[j.tanggal] = true;
    }
    return {
      awal, akhir,
      rows: users.map((x) => ({ id: x.id, nik: x.nik, nama: x.nama, cabang: x.cnama ?? '', jamMode: x.jam_mode, shiftBawaan: x.shift_id,
        jadwal: peta[x.id] ?? {}, hasilTukar: tukar[x.id] ?? {} })),
      shift: (await q('SELECT * FROM shift WHERE aktif=1 ORDER BY jam_masuk')).map(shiftPublik),
    };
  },
  async adm_jadwal_save(m) {
    const u = await need(['admin']);
    const uid = i(m, 'userId');
    if (!uid) gagal('Karyawan tidak dipilih');
    const shiftId = m.shiftId !== undefined && m.shiftId !== null && m.shiftId !== '' ? Number(m.shiftId) : null;
    const hapus = !!m.hapus, mulai = s(m, 'mulai'), selesai = s(m, 'selesai', mulai);
    if (!POLA_TGL.test(mulai) || !POLA_TGL.test(selesai)) gagal('Tanggal tidak sah');
    if (selesai < mulai) gagal('Rentang tanggal tidak valid');
    if ((epoch(selesai) - epoch(mulai)) / 86400 > 366) gagal('Rentang terlalu panjang');
    const hari: number[] = Array.isArray(m.hari) ? m.hari.map(Number) : [];   // 1=Senin .. 7=Minggu; kosong = semua hari
    if (shiftId !== null && !(await shiftById(shiftId))) gagal('Shift tidak ditemukan');
    let n = 0;
    for (let t = mulai; t <= selesai; t = tambahHari(t, 1)) {
      if (hari.length && !hari.includes(hariIso(t))) continue;
      if (hapus) await exec('DELETE FROM jadwal_shift WHERE user_id=? AND tanggal=?', [uid, t]);
      else await exec(`INSERT INTO jadwal_shift (user_id,tanggal,shift_id,dibuat_oleh) VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE shift_id=VALUES(shift_id), dibuat_oleh=VALUES(dibuat_oleh)`, [uid, t, shiftId, u.nama]);
      n++;
    }
    await logAksi(u.id, 'atur_jadwal', `user#${uid} ${mulai}..${selesai}`);
    return { pesan: hapus ? `${n} tanggal dikosongkan dari jadwal` : `${n} tanggal dijadwalkan` };
  },
};
