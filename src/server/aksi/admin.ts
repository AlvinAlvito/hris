/* Kelola: dashboard harian, lokasi kerja, karyawan, absensi & koreksi, rekap bulanan, pengaturan, log */
import bcrypt from 'bcryptjs';
import { exec, nilai, q, q1, sisipkan, type Baris } from '@/lib/db';
import { f, gagal, i, s } from '@/lib/http';
import {
  batasJamTerbuka, cabangPublik, cutiAktif, jadwalHari, jamTeks, labelKet, logAksi, need, shiftById, sisaCuti,
} from '@/lib/aturan';
import { setgInt, setSetting, settingsPublik } from '@/lib/pengaturan';
import { absRow, ambilBiodata, userPublik } from '@/lib/format';
import { epoch, POLA_JAM, POLA_TGL, sekarangSql, tambahHari, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const bulanTahun = (m: Record<string, any>) => {
  const k = tglWIB();
  return { bl: Math.max(1, Math.min(12, i(m, 'bulan', Number(k.slice(5, 7))))), th: i(m, 'tahun', Number(k.slice(0, 4))) };
};

export const aksiAdmin: KumpulanAksi = {
  /* ---------- kondisi hari ini ---------- */
  async adm_dash(m) {
    const u = await need(['admin']);
    const fCab = i(m, 'cabangId'), tgl = tglWIB();
    const rows = await q(`SELECT u.*, c.nama cnama, c.tipe ctipe, a.id aid, a.in_time, a.out_time, a.terlambat, a.menit_telat,
        a.mode amode, a.in_jarak, a.in_luar, a.out_luar, a.in_photo, a.base_label abase,
        a.shift_nama, a.jam_mode ajammode, a.menit_kerja, a.kurang_menit, a.lembur_menit, a.target_menit atarget
      FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id LEFT JOIN absensi a ON a.user_id=u.id AND a.tanggal=CURDATE()
      WHERE u.role<>'direktur' AND u.aktif=1${fCab ? ' AND u.cabang_id=?' : ''}
      ORDER BY FIELD(c.tipe,'pusat','cabang'), c.nama, u.nama`, fCab ? [fCab] : []);
    const cuti: Record<number, string> = {};
    for (const c of await q("SELECT user_id,jenis FROM cuti WHERE status='Disetujui' AND mulai<=? AND selesai>=?", [tgl, tgl])) cuti[c.user_id] = c.jenis;
    const ket: Record<number, { jenis: string; status: string }> = {};
    for (const k of await q(`SELECT user_id,jenis,status FROM ketidakhadiran WHERE tanggal=?
      AND status IN ('Menunggu Rekomendasi','Menunggu HR','Disetujui')`, [tgl])) ket[k.user_id] = { jenis: labelKet(k.jenis), status: k.status };
    const data = [];
    for (const r of rows) {
      const j = await jadwalHari(r, tgl);
      data.push({
        id: r.id, nik: r.nik, nama: r.nama, dept: r.dept, role: r.role, lokasiMode: r.lokasi_mode,
        cabangNama: r.cnama ?? '', cabangTipe: r.ctipe ?? '', jamMode: r.jam_mode, shiftNama: r.shift_nama ?? '',
        menitKerja: r.menit_kerja ?? 0, targetMenit: r.atarget ?? 0, kurangMenit: r.kurang_menit ?? 0, lemburMenit: r.lembur_menit ?? 0,
        jadwalHariIni: j.libur ? 'LIBUR' : r.jam_mode === 'fleksibel' ? 'Fleksibel ' + jamTeks(r.target_menit) : j.shift?.nama ?? '',
        inTime: r.in_time ? String(r.in_time).slice(0, 5) : '', outTime: r.out_time ? String(r.out_time).slice(0, 5) : '',
        terlambat: r.terlambat === 1, menitTelat: r.menit_telat ?? 0, absenId: r.aid ?? null,
        foto: r.in_photo ? '/uploads/' + r.in_photo : '', amode: r.amode, jarak: r.in_jarak ?? null,
        luar: r.in_luar === 1 || r.out_luar === 1, baseLabel: r.abase, cuti: cuti[r.id] ?? '',
        ket: ket[r.id]?.jenis ?? '', ketStatus: ket[r.id]?.status ?? '', sisaCuti: cutiAktif(r) ? await sisaCuti(r) : null,
      });
    }
    const pending = Number(await nilai("SELECT COUNT(*) FROM cuti WHERE status='Menunggu'"));
    const pendingJadwal = Number(await nilai(`SELECT (SELECT COUNT(*) FROM pengajuan WHERE status='Menunggu HR')
      + (SELECT COUNT(*) FROM tukar_jadwal WHERE status='Menunggu HR') + (SELECT COUNT(*) FROM ketidakhadiran WHERE status='Menunggu HR')`));
    // rekap ringkas per lokasi kerja (selalu seluruh lokasi, tidak ikut filter)
    const perCabang = (await q(`SELECT c.id, c.nama, c.tipe, COUNT(u.id) total,
        SUM(CASE WHEN a.in_time IS NOT NULL THEN 1 ELSE 0 END) hadir, SUM(CASE WHEN a.terlambat=1 THEN 1 ELSE 0 END) telat
      FROM cabang c LEFT JOIN users u ON u.cabang_id=c.id AND u.role<>'direktur' AND u.aktif=1
      LEFT JOIN absensi a ON a.user_id=u.id AND a.tanggal=CURDATE()
      GROUP BY c.id, c.nama, c.tipe ORDER BY FIELD(c.tipe,'pusat','cabang'), c.nama`))
      .map((c) => ({ id: c.id, nama: c.nama, tipe: c.tipe, total: Number(c.total), hadir: Number(c.hadir ?? 0), telat: Number(c.telat ?? 0) }));
    return { tanggal: tgl, rows: data, pending, pendingJadwal, perCabang, me: await userPublik(u) };
  },

  /* ---------- lokasi kerja ---------- */
  async adm_cabang() {
    await need();
    return (await q(`SELECT c.*, (SELECT COUNT(*) FROM users x WHERE x.cabang_id=c.id) jml FROM cabang c
      ORDER BY FIELD(c.tipe,'pusat','cabang','kegiatan'), c.nama`)).map((c) => ({ ...cabangPublik(c), jumlahKaryawan: Number(c.jml) }));
  },
  async adm_cabang_save(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), nama = s(m, 'nama'), tipe = s(m, 'tipe', 'cabang');
    if (!nama) gagal('Nama lokasi kerja wajib diisi');
    if (!['pusat', 'cabang', 'kegiatan'].includes(tipe)) gagal('Tipe lokasi tidak sah');
    const rad = i(m, 'radius', 200);
    if (rad < 20 || rad > 5000) gagal('Radius harus antara 20 dan 5000 meter');
    if (await q1('SELECT id FROM cabang WHERE LOWER(nama)=LOWER(?) AND id<>?', [nama, id])) gagal('Nama lokasi sudah dipakai');
    const data = [nama, tipe, s(m, 'alamat'), f(m, 'lat'), f(m, 'lng'), rad, i(m, 'aktif', 1) ? 1 : 0];
    if (id) await exec('UPDATE cabang SET nama=?,tipe=?,alamat=?,lat=?,lng=?,radius=?,aktif=? WHERE id=?', [...data, id]);
    else await exec('INSERT INTO cabang (nama,tipe,alamat,lat,lng,radius,aktif) VALUES (?,?,?,?,?,?,?)', data);
    await logAksi(u.id, id ? 'edit_cabang' : 'tambah_cabang', nama);
    return { pesan: 'Lokasi kerja tersimpan' };
  },
  async adm_cabang_del(m) {
    const u = await need(['admin']);
    const id = i(m, 'id');
    const c = await q1('SELECT * FROM cabang WHERE id=?', [id]);
    if (!c) gagal('Lokasi tidak ditemukan');
    const n = Number(await nilai('SELECT COUNT(*) FROM users WHERE cabang_id=?', [id]));
    if (n > 0) gagal(`Masih ada ${n} karyawan terdaftar di lokasi ini. Pindahkan dulu, baru hapus.`);
    if (Number(await nilai('SELECT COUNT(*) FROM cabang')) < 2) gagal('Minimal harus ada satu lokasi kerja');
    await exec('DELETE FROM cabang WHERE id=?', [id]);
    await logAksi(u.id, 'hapus_cabang', c.nama);
    return { pesan: 'Lokasi kerja dihapus' };
  },

  /* ---------- karyawan ---------- */
  async adm_users() {
    await need(['admin']);
    const rows = await q(`SELECT u.* FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id
      ORDER BY FIELD(u.role,'direktur','admin','finance','atasan','karyawan'), c.nama, u.nama`);
    return Promise.all(rows.map(userPublik));
  },
  async adm_user_save(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), nik = s(m, 'nik'), nama = s(m, 'nama'), pin = s(m, 'pin');
    if (!nik || !nama) gagal('NIK dan nama wajib diisi');
    const role = s(m, 'role', 'karyawan');
    if (!['karyawan', 'admin', 'direktur'].includes(role)) gagal('Peran tidak sah');
    if (role === 'direktur' && u.role !== 'direktur') gagal('Hanya Super Admin yang dapat membuat akun Super Admin');
    const lm = s(m, 'lokasiMode', 'kantor');
    if (!['kantor', 'lapangan', 'bebas'].includes(lm)) gagal('Mode lokasi tidak sah');
    const baseLat = f(m, 'baseLat'), baseLng = f(m, 'baseLng');
    if (lm === 'lapangan' && (baseLat === null || baseLng === null)) gagal('Titik awal wajib dipilih untuk mode lapangan');
    if (await q1('SELECT id FROM users WHERE LOWER(nik)=? AND id<>?', [nik.toLowerCase(), id])) gagal('NIK sudah dipakai');
    let cabangId: number | null = i(m, 'cabangId') || null;
    if (cabangId && !(await q1('SELECT id FROM cabang WHERE id=?', [cabangId]))) gagal('Lokasi kerja tidak ditemukan');
    if (lm === 'kantor' && !cabangId) gagal('Pilih lokasi kerja (kantor pusat / cabang) untuk mode Kantor');
    const jm = s(m, 'jamMode', 'tetap');
    if (!['tetap', 'shift', 'fleksibel'].includes(jm)) gagal('Pola jam kerja tidak sah');
    let shiftId: number | null = i(m, 'shiftId') || null;
    if (jm === 'shift') { if (!shiftId || !(await shiftById(shiftId))) gagal('Pilih shift bawaan untuk karyawan bermode Shift'); } else shiftId = null;
    const targetMenit = Math.max(60, Math.min(1440, i(m, 'targetMenit', await setgInt('target_menit_default', 480))));
    let intiA = s(m, 'intiMulai'), intiB = s(m, 'intiSelesai');
    if (jm === 'fleksibel' && (intiA !== '' || intiB !== '')) {
      if (!POLA_JAM.test(intiA) || !POLA_JAM.test(intiB)) gagal('Jam inti harus diisi lengkap (mulai dan selesai)');
    } else { intiA = ''; intiB = ''; }
    // hari libur mingguan: '' = bawaan; '0' = tidak ada; '1'..'7' dipisah koma
    let liburHari: string | null | undefined;
    if ('liburHari' in m) {
      const raw = String(m.liburHari ?? '').trim();
      if (raw === '') liburHari = null;
      else if (raw === '0') liburHari = '0';
      else {
        const ok = [...new Set(raw.split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => d >= 1 && d <= 7))];
        liburHari = ok.length ? ok.join(',') : null;
      }
    }
    // atasan langsung: tidak boleh diri sendiri & tidak boleh melingkar
    const atasanId = i(m, 'atasanId') || null;
    if (atasanId) {
      if (id && atasanId === id) gagal('Atasan tidak boleh diri sendiri');
      let jalur: number | null = atasanId, langkah = 0;
      while (jalur && langkah++ < 50) {
        const r: Baris | null = await q1('SELECT id, atasan_id FROM users WHERE id=?', [jalur]);
        if (!r) { if (jalur === atasanId) gagal('Atasan tidak ditemukan'); break; }
        if (id && r.atasan_id === id) gagal('Struktur melingkar: karyawan ini adalah atasan dari atasan yang dipilih');
        jalur = r.atasan_id || null;
      }
    }
    const data: Baris = {
      nik, nama, jabatan: s(m, 'jabatan', 'Staff'), dept: s(m, 'dept'), cabang_id: cabangId, jam_mode: jm, shift_id: shiftId,
      target_menit: targetMenit, inti_mulai: intiA ? intiA + ':00' : null, inti_selesai: intiB ? intiB + ':00' : null,
      tgl_masuk: s(m, 'tglMasuk', tglWIB()), role, cuti_mode: role === 'direktur' ? 'off' : s(m, 'cutiMode', 'auto'),
      jatah: i(m, 'jatah', 12), lokasi_mode: lm, min_jarak_km: f(m, 'minJarakKm', 2.5),
      base_lat: lm === 'lapangan' ? baseLat : null, base_lng: lm === 'lapangan' ? baseLng : null,
      base_label: lm === 'lapangan' ? s(m, 'baseLabel', 'Titik awal') : '', aktif: i(m, 'aktif', 1) ? 1 : 0,
      ...ambilBiodata(m),
    };
    if (liburHari !== undefined) data.libur_hari = liburHari;
    if ('atasanId' in m) data.atasan_id = atasanId;
    if (!POLA_TGL.test(data.tgl_masuk)) gagal('Tanggal masuk tidak sah');
    if (pin !== '' && !/^\d{4,8}$/.test(pin)) gagal('PIN harus 4–8 digit angka');
    let idBaru = id;
    if (id) {
      const lama = await q1('SELECT * FROM users WHERE id=?', [id]);
      if (!lama) gagal('Karyawan tidak ditemukan');
      if (lama.role === 'direktur' && role !== 'direktur' && Number(await nilai("SELECT COUNT(*) FROM users WHERE role='direktur'")) < 2)
        gagal('Minimal harus ada satu akun Super Admin');
      if (lm === 'lapangan' && (lama.base_lat === null || Number(lama.base_lat) !== baseLat)) { data.base_set_by = u.nama; data.base_set_at = sekarangSql(); }
      if (pin !== '') data.pin_hash = await bcrypt.hash(pin, 10);
      const k = Object.keys(data);
      await exec(`UPDATE users SET ${k.map((x) => `${x}=:${x}`).join(',')} WHERE id=:__id`, { ...data, __id: id });
      await logAksi(u.id, 'edit_karyawan', nik);
    } else {
      if (!/^\d{4,8}$/.test(pin)) gagal('PIN harus 4–8 digit angka');
      data.pin_hash = await bcrypt.hash(pin, 10);
      if (lm === 'lapangan') { data.base_set_by = u.nama; data.base_set_at = sekarangSql(); }
      idBaru = await sisipkan('users', data);
      await logAksi(u.id, 'tambah_karyawan', nik);
    }
    return { pesan: 'Data karyawan tersimpan', id: idBaru };
  },
  async adm_user_del(m) {
    const u = await need(['admin']);
    const id = i(m, 'id');
    if (id === u.id) gagal('Tidak dapat menghapus akun sendiri');
    const t = await q1('SELECT * FROM users WHERE id=?', [id]);
    if (!t) gagal('Karyawan tidak ditemukan');
    if (t.role === 'direktur' && Number(await nilai("SELECT COUNT(*) FROM users WHERE role='direktur'")) < 2) gagal('Minimal harus ada satu akun Super Admin');
    await exec('DELETE FROM users WHERE id=?', [id]);
    await logAksi(u.id, 'hapus_karyawan', t.nik);
    return { pesan: 'Karyawan dihapus' };
  },

  /* ---------- absensi ---------- */
  async adm_absensi(m) {
    await need(['admin']);
    const { bl, th } = bulanTahun(m), uid = i(m, 'userId'), cid = i(m, 'cabangId');
    let sql = 'SELECT a.*, u.nik,u.nama,u.dept FROM absensi a JOIN users u ON u.id=a.user_id WHERE YEAR(a.tanggal)=? AND MONTH(a.tanggal)=?';
    const p: unknown[] = [th, bl];
    if (uid) { sql += ' AND a.user_id=?'; p.push(uid); }
    if (cid) { sql += ' AND u.cabang_id=?'; p.push(cid); }
    return (await q(sql + ' ORDER BY a.tanggal DESC, u.nama', p)).map(absRow);
  },
  async adm_lupa_out(m) {
    await need(['admin']);
    await exec(`UPDATE absensi SET lupa_out=1 WHERE in_time IS NOT NULL AND out_time IS NULL AND lupa_out=0
      AND TIMESTAMPDIFF(HOUR, TIMESTAMP(tanggal, in_time), NOW()) > ?`, [await batasJamTerbuka()]);
    const cid = i(m, 'cabangId');
    return (await q(`SELECT a.*, u.nik,u.nama,u.dept FROM absensi a JOIN users u ON u.id=a.user_id
      WHERE a.in_time IS NOT NULL AND a.out_time IS NULL AND a.lupa_out=1${cid ? ' AND u.cabang_id=?' : ''}
      ORDER BY a.tanggal DESC, u.nama LIMIT 200`, cid ? [cid] : [])).map(absRow);
  },
  /* koreksi manual: semua dihitung ulang dari jam yang dimasukkan, dan tercatat siapa & mengapa */
  async adm_absen_koreksi(m) {
    const u = await need(['admin']);
    const id = i(m, 'id');
    const a = await q1(`SELECT a.*, u.nama, u.nik, u.jam_mode ujm, u.inti_mulai, u.inti_selesai FROM absensi a JOIN users u ON u.id=a.user_id WHERE a.id=?`, [id]);
    if (!a) gagal('Data absensi tidak ditemukan');
    const catatan = s(m, 'catatan');
    if (!catatan) gagal('Catatan koreksi wajib diisi — ini yang dilihat auditor nanti');
    const jamIn = s(m, 'jamMasuk'), jamOut = s(m, 'jamPulang');
    if (!POLA_JAM.test(jamIn)) gagal('Jam masuk tidak sah');
    if (jamOut !== '' && !POLA_JAM.test(jamOut)) gagal('Jam pulang tidak sah');
    const tglMasuk = a.tanggal, inTs = epoch(tglMasuk, jamIn);
    let outTime: string | null = null, tglPulang: string | null = null, menitKerja = 0, kurang = 0, lembur = 0, langgar = 0, lupa = 1;
    if (jamOut !== '') {
      // tanggal pulang: hari yang sama, atau hari berikutnya bila jam pulang lebih awal
      let tglOut = s(m, 'tglPulang');
      if (tglOut !== '' && POLA_TGL.test(tglOut)) { if (tglOut < tglMasuk) gagal('Tanggal pulang tidak boleh sebelum tanggal masuk'); }
      else tglOut = epoch(tglMasuk, jamOut) <= inTs ? tambahHari(tglMasuk, 1) : tglMasuk;
      const outTs = epoch(tglOut, jamOut);
      menitKerja = Math.round((outTs - inTs) / 60);
      if (menitKerja <= 0) gagal('Jam pulang harus setelah jam masuk');
      if (menitKerja > 1440) gagal('Durasi kerja melebihi 24 jam — periksa lagi tanggal dan jamnya');
      outTime = jamOut + ':00'; tglPulang = tglOut !== tglMasuk ? tglOut : null; lupa = 0;
      const target = Number(a.target_menit);
      kurang = target > 0 ? Math.max(0, target - menitKerja) : 0;
      const lemburMin = await setgInt('lembur_min_menit', 30);
      lembur = target > 0 && menitKerja - target >= lemburMin && !a.izin_sesi ? menitKerja - target : 0;
      if ((a.ujm ?? 'tetap') === 'fleksibel' && a.inti_mulai && a.inti_selesai) {
        const intiA = epoch(tglMasuk, a.inti_mulai); let intiB = epoch(tglMasuk, a.inti_selesai);
        if (intiB <= intiA) intiB += 86400;
        if (inTs > intiA || outTs < intiB) langgar = 1;
      }
    }
    // hitung ulang keterlambatan terhadap jadwal yang tersimpan di baris itu (izin pagi tidak dihitung telat)
    let telat = 0, menitTelat = 0;
    if (a.jadwal_in && a.izin_sesi !== 'pagi') {
      let tol = (a.ujm ?? 'tetap') === 'shift' ? 0 : await setgInt('toleransi', 10);
      if (a.shift_id) { const sh = await shiftById(a.shift_id); if (sh) tol = sh.toleransi; }
      const seharusnya = epoch(tglMasuk, a.jadwal_in);
      if (inTs > seharusnya + tol * 60) { telat = 1; menitTelat = Math.floor((inTs - seharusnya) / 60); }
    }
    const sebelum = String(a.in_time).slice(0, 5) + '→' + (a.out_time ? String(a.out_time).slice(0, 5) : 'kosong');
    const sesudah = jamIn + '→' + (jamOut || 'kosong');
    await exec(`UPDATE absensi SET in_time=?, out_time=?, tgl_pulang=?, menit_kerja=?, kurang_menit=?, lembur_menit=?, langgar_inti=?,
      terlambat=?, menit_telat=?, lupa_out=?, dikoreksi=1, koreksi_oleh=?, koreksi_catatan=?, tgl_koreksi=NOW() WHERE id=?`,
    [jamIn + ':00', outTime, tglPulang, menitKerja, kurang, lembur, langgar, telat, menitTelat, lupa, u.nama, catatan, id]);
    await logAksi(u.id, 'koreksi_absensi', `${a.nik} ${a.tanggal} ${sebelum} jadi ${sesudah} — ${catatan}`);
    const baris = await q1('SELECT a.*, u.nik,u.nama,u.dept FROM absensi a JOIN users u ON u.id=a.user_id WHERE a.id=?', [id]);
    return {
      pesan: jamOut ? `Absensi dikoreksi. Total kerja ${jamTeks(menitKerja)}.` : 'Jam masuk dikoreksi. Jam pulang masih kosong — baris tetap ditandai lupa clock out.',
      baris: absRow(baris!),
    };
  },
  async adm_rekap(m) {
    await need(['admin']);
    const { bl, th } = bulanTahun(m), cid = i(m, 'cabangId');
    const users = await q(`SELECT u.*, c.nama cnama FROM users u LEFT JOIN cabang c ON c.id=u.cabang_id
      WHERE u.role<>'direktur'${cid ? ' AND u.cabang_id=?' : ''} ORDER BY c.nama, u.nama`, cid ? [cid] : []);
    const jam = (n: unknown) => Math.round((Number(n) / 60) * 10) / 10;
    const hasil = [];
    for (const u of users) {
      const r = (await q1(`SELECT COUNT(*) hadir, COALESCE(SUM(terlambat),0) telat, COALESCE(SUM(menit_telat),0) mtelat,
          COALESCE(SUM(menit_kerja),0) mkerja, COALESCE(SUM(kurang_menit),0) mkurang, COALESCE(SUM(lembur_menit),0) mlembur,
          COALESCE(SUM(target_menit),0) mtarget, COALESCE(SUM(CASE WHEN out_time IS NULL THEN 1 ELSE 0 END),0) blmout,
          COALESCE(SUM(CASE WHEN mode='lapangan' THEN 1 ELSE 0 END),0) lap
        FROM absensi WHERE user_id=? AND YEAR(tanggal)=? AND MONTH(tanggal)=?`, [u.id, th, bl]))!;
      const n = async (sql: string) => Number(await nilai(sql, [u.id, th, bl]));
      const sh = await shiftById(u.shift_id);
      hasil.push({
        nik: u.nik, nama: u.nama, dept: u.dept, jabatan: u.jabatan, cabang: u.cnama ?? '', peran: u.role,
        hadir: Number(r.hadir), telat: Number(r.telat), menitTelat: Number(r.mtelat), belumOut: Number(r.blmout),
        jamKerja: jam(r.mkerja), lapangan: Number(r.lap), polaJam: u.jam_mode,
        lemburDisetujuiJam: jam(await n(`SELECT COALESCE(SUM(menit),0) FROM pengajuan WHERE user_id=? AND jenis='lembur' AND status='Disetujui' AND YEAR(tanggal)=? AND MONTH(tanggal)=?`)),
        pengajuanDisetujui: await n(`SELECT COUNT(*) FROM pengajuan WHERE user_id=? AND status='Disetujui' AND YEAR(tanggal)=? AND MONTH(tanggal)=?`),
        shiftBawaan: sh?.nama ?? '', targetJam: jam(r.mtarget), kurangJam: jam(r.mkurang), lemburJam: jam(r.mlembur),
        cutiBulanIni: await n(`SELECT COALESCE(SUM(hari),0) FROM cuti WHERE user_id=? AND status='Disetujui' AND YEAR(mulai)=? AND MONTH(mulai)=?`),
        sisaCuti: cutiAktif(u) ? await sisaCuti(u) : 0,
        ketDisetujui: await n(`SELECT COUNT(*) FROM ketidakhadiran WHERE user_id=? AND status='Disetujui' AND YEAR(tanggal)=? AND MONTH(tanggal)=?`),
      });
    }
    return hasil;
  },

  /* ---------- pengaturan & log ---------- */
  async adm_settings_save(m) {
    const u = await need(['admin']);
    const kunci = ['perusahaan', 'slogan', 'jam_masuk', 'jam_pulang', 'toleransi', 'jatah_default', 'min_jarak_default', 'wajib_foto',
      'geofence_on', 'titik_awal_oleh_admin', 'office_lat', 'office_lng', 'radius', 'rekomendasi_atasan', 'libur_minggu_nonshift',
      'libur_nasional_aktif', 'hari_kerja_seminggu', 'batas_jam_terbuka', 'lembur_min_menit', 'target_menit_default',
      'reimburse_kategori', 'reimburse_maks_hari', 'kasbon_maks_kali_gaji', 'kasbon_tenor_maks', 'kasbon_satu_aktif'];
    for (const k of ['jam_masuk', 'jam_pulang']) if (k in m && !POLA_JAM.test(String(m[k]))) gagal('Format jam tidak sah (JJ:MM)');
    for (const k of kunci) if (k in m) await setSetting(k, typeof m[k] === 'boolean' ? (m[k] ? 1 : 0) : String(m[k] ?? ''));
    await logAksi(u.id, 'ubah_pengaturan');
    return { settings: await settingsPublik() };
  },
  async adm_log() {
    await need(['direktur']);
    return q('SELECT l.*, u.nama, u.nik FROM log_aktivitas l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 200');
  },
};
