import { exec, q, q1 } from '@/lib/db';
import { f, gagal, i, s } from '@/lib/http';
import {
  absensiBerjalan, batasJamTerbuka, cabangById, isAdminUp, izinKerja, jadwalHari, jamTeks, jarakMeter, labelKet,
  logAksi, need, shiftPublik, tandaiLupaOut, targetMenit,
} from '@/lib/aturan';
import { setg, setgInt } from '@/lib/pengaturan';
import { absRow, userPublik } from '@/lib/format';
import { simpanFoto } from '@/lib/berkas';
import { konteks } from '@/lib/konteks';
import { detikSekarang, epoch, jamWIB, tglWIB } from '@/lib/waktu';
import type { KumpulanAksi } from '../daftar';

const km = (m: number) => (m / 1000).toFixed(2).replace('.', ',');

export const aksiAbsen: KumpulanAksi = {
  /* ---------- beranda karyawan ---------- */
  async home() {
    const u = await need();
    const tglNow = tglWIB();
    await tandaiLupaOut(u.id);
    let today = await q1('SELECT * FROM absensi WHERE user_id=? AND tanggal=?', [u.id, tglNow]);
    // shift malam: absensi kemarin yang belum ditutup masih dianggap berjalan selama belum lewat batas wajar
    if (!today) today = await absensiBerjalan(u.id, tglNow);
    const lupa = (await q(`SELECT tanggal, in_time FROM absensi WHERE user_id=? AND in_time IS NOT NULL
      AND out_time IS NULL AND lupa_out=1 ORDER BY tanggal DESC LIMIT 5`, [u.id]))
      .map((x) => ({ tanggal: x.tanggal, inTime: String(x.in_time).slice(0, 5) }));
    const r = await q1(`SELECT COUNT(*) hadir, COALESCE(SUM(terlambat),0) telat, COALESCE(SUM(kurang_menit),0) k,
      COALESCE(SUM(lembur_menit),0) l FROM absensi WHERE user_id=? AND YEAR(tanggal)=YEAR(CURDATE()) AND MONTH(tanggal)=MONTH(CURDATE())`, [u.id]);
    const jd = await jadwalHari(u, tglNow);
    const ket = await q1(`SELECT jenis, status FROM ketidakhadiran WHERE user_id=? AND tanggal=?
      AND status IN ('Menunggu Rekomendasi','Menunggu HR','Disetujui') ORDER BY id DESC LIMIT 1`, [u.id, tglNow]);
    const [kerjaDari, sesiIzin] = await izinKerja(u.id, tglNow);
    return {
      izinHariIni: { kerjaDari, sesi: sesiIzin },
      me: await userPublik(u),
      hariIni: today ? absRow(today) : null,
      lupaOut: lupa,
      ketHariIni: ket ? { jenis: ket.jenis, jenisLabel: labelKet(ket.jenis), status: ket.status } : null,
      hadir: Number(r?.hadir ?? 0), telat: Number(r?.telat ?? 0),
      kurangBulan: Number(r?.k ?? 0), lemburBulan: Number(r?.l ?? 0),
      jadwal: {
        jamMode: u.jam_mode, libur: jd.libur, liburMingguan: jd.sumber === 'mingguan', sumber: jd.sumber, ket: jd.ket ?? '',
        shift: jd.shift ? shiftPublik(jd.shift) : null,
        target: await targetMenit(u, jd.shift),
        intiMulai: u.inti_mulai ? String(u.inti_mulai).slice(0, 5) : '',
        intiSelesai: u.inti_selesai ? String(u.inti_selesai).slice(0, 5) : '',
      },
      serverTime: tglNow + ' ' + jamWIB(),
    };
  },

  /* ---------- clock in / clock out ---------- */
  async absen(m) {
    const u = await need();
    if (u.role === 'direktur') gagal('Super Admin tidak melakukan absensi');
    const mode = s(m, 'mode');
    if (mode !== 'in' && mode !== 'out') gagal('Mode absen tidak sah');
    const lat = f(m, 'lat'), lng = f(m, 'lng'), foto = s(m, 'photo');
    if (lat === null || lng === null) gagal('Lokasi GPS tidak terbaca. Aktifkan GPS lalu coba lagi.');

    /* WFH / dinas luar kota yang disetujui HC: absen tanpa batas lokasi.
       Saat clock out, yang dipakai izin pada tanggal clock in. */
    let tglIzin = tglWIB();
    if (mode === 'out') { const b = await absensiBerjalan(u.id, tglIzin); if (b) tglIzin = b.tanggal; }
    const [kerjaDari, izinSesi] = await izinKerja(u.id, tglIzin);

    /* --- validasi lokasi (di server, tidak bisa dimanipulasi dari HP) --- */
    let jarak: number | null = null, luar = 0;
    const lm = u.lokasi_mode;
    if (kerjaDari !== '') {
      // lokasi tetap direkam, tetapi tidak dibatasi
    } else if (lm === 'lapangan') {
      if (u.base_lat === null) gagal('Titik awal kunjungan belum ditetapkan HC');
      jarak = jarakMeter(lat, lng, Number(u.base_lat), Number(u.base_lng));
      const minM = Math.round(Number(u.min_jarak_km) * 1000);
      if (jarak < minM) gagal(`Absen ditolak: Anda baru ${km(jarak)} km dari titik awal (${u.base_label}). Minimal ${km(minM)} km.`);
    } else if (lm === 'kantor') {
      const cab = await cabangById(u.cabang_id);
      if (cab && cab.aktif !== 1) gagal(`Lokasi kerja "${cab.nama}" sedang nonaktif. Hubungi HC.`);
      let oLat: number | null, oLng: number | null, rad: number, namaTitik: string;
      if (cab && cab.lat !== null && cab.lng !== null) {
        oLat = Number(cab.lat); oLng = Number(cab.lng); rad = cab.radius; namaTitik = cab.nama;
      } else {
        const a = await setg('office_lat'), b = await setg('office_lng');
        oLat = a === '' ? null : Number(a); oLng = b === '' ? null : Number(b);
        rad = await setgInt('radius', 200); namaTitik = cab ? cab.nama : 'kantor';
        if (cab && oLat === null) gagal(`Titik lokasi "${cab.nama}" belum ditetapkan HC di peta.`);
      }
      if (oLat !== null && oLng !== null) {
        jarak = jarakMeter(lat, lng, oLat, oLng);
        if (jarak > rad) {
          luar = 1;
          if ((await setgInt('geofence_on', 1)) === 1) gagal(`Absen ditolak: Anda berada ${km(jarak)} km dari ${namaTitik}, batas ${rad} m.`);
        }
      }
    }
    const cabAbs = await cabangById(u.cabang_id);
    if ((await setgInt('wajib_foto', 1)) === 1 && foto === '') gagal('Foto wajib diambil dari kamera');

    const tgl = tglWIB(), jam = jamWIB();
    await tandaiLupaOut(u.id);
    const row = await q1('SELECT * FROM absensi WHERE user_id=? AND tanggal=?', [u.id, tgl]);
    const jm = u.jam_mode || 'tetap';
    const k = konteks();
    let pesan: string, tglRow: string;

    if (mode === 'in') {
      if (row && row.in_time) gagal('Anda sudah clock in hari ini');
      const jd = await jadwalHari(u, tgl), sh = jd.shift;
      let telat = 0, menitTelat = 0, jadwalIn: string | null = null, jadwalOut: string | null = null, shiftNama = '';
      const kini = detikSekarang();
      if (jm === 'shift') {
        if (jd.libur) shiftNama = 'Di luar jadwal (dijadwalkan libur)';
        else if (sh) {
          shiftNama = sh.nama; jadwalIn = sh.jam_masuk; jadwalOut = sh.jam_pulang;
          if (kini > epoch(tgl, sh.jam_masuk) + sh.toleransi * 60) { telat = 1; menitTelat = Math.floor((kini - epoch(tgl, sh.jam_masuk)) / 60); }
        } else shiftNama = 'Belum dijadwalkan';
      } else if (jm === 'fleksibel') {
        shiftNama = jd.libur ? 'Masuk saat libur' : 'Fleksibel';    // jam masuk bebas, tidak pernah telat
      } else if (jd.libur) {
        shiftNama = 'Masuk saat libur';
      } else {
        const jamMasuk = await setg('jam_masuk', '08:00'), tol = await setgInt('toleransi', 10);
        jadwalIn = jamMasuk + ':00'; jadwalOut = (await setg('jam_pulang', '17:00')) + ':00';
        if (kini > epoch(tgl, jamMasuk) + tol * 60) { telat = 1; menitTelat = Math.floor((kini - epoch(tgl, jamMasuk)) / 60); }
      }
      let target = await targetMenit(u, sh);
      // izin setengah hari: target separuh; sesi pagi berarti masuk siang, jadi tidak dihitung telat
      if (izinSesi !== '') { target = Math.floor(target / 2); if (izinSesi === 'pagi') { telat = 0; menitTelat = 0; } }

      const file = foto !== '' ? await simpanFoto(foto, u.id, 'in') : '';
      await exec(`INSERT INTO absensi (user_id,tanggal,mode,kerja_dari,izin_sesi,in_time,in_photo,in_lat,in_lng,in_jarak,in_luar,
        base_label,cabang_id,cabang_nama,jam_mode,shift_id,shift_nama,jadwal_in,jadwal_out,target_menit,terlambat,menit_telat,ip,ua)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [u.id, tgl, lm, kerjaDari, izinSesi, jam, file, lat, lng, jarak, luar, lm === 'lapangan' ? u.base_label : '',
          cabAbs?.id ?? null, cabAbs?.nama ?? '', jm, sh?.id ?? null, shiftNama, jadwalIn, jadwalOut, target, telat, menitTelat,
          (k?.ip ?? '').slice(0, 45), (k?.ua ?? '').slice(0, 255)]);
      await logAksi(u.id, 'clock_in', jam + (shiftNama ? ' · ' + shiftNama : '') + (kerjaDari ? ' · ' + labelKet(kerjaDari) : ''));
      if (telat) pesan = `Clock in tersimpan — terlambat ${menitTelat} menit`;
      else if (jm === 'fleksibel') pesan = `Clock in berhasil. Target kerja hari ini ${jamTeks(target)}.`;
      else if (jd.libur) pesan = 'Clock in tersimpan. Catatan: hari ini Anda dijadwalkan libur.';
      else pesan = 'Clock in berhasil. Selamat bekerja!';
      tglRow = tgl;
    } else {
      /* absensi terbuka: hari ini, atau kemarin untuk shift lintas hari */
      const buka = await absensiBerjalan(u.id, tgl);
      if (!buka) {
        if (row && row.out_time) gagal('Anda sudah clock out hari ini');
        if (row && row.in_time) gagal(`Absensi Anda sudah lewat batas ${await batasJamTerbuka()} jam sejak clock in. Minta HC mengoreksi jam pulangnya lewat menu Koreksi Absensi.`);
        gagal('Belum clock in hari ini');
      }
      const tglMasuk = buka.tanggal, lewatHari = tglMasuk !== tgl;
      let menitKerja = Math.floor((epoch(tgl, jam) - epoch(tglMasuk, buka.in_time)) / 60);
      if (menitKerja < 0) menitKerja = 0;
      if (menitKerja > 1440) gagal('Clock out melewati 24 jam sejak clock in. Hubungi HC untuk koreksi manual.');
      const target = Number(buka.target_menit);
      const kurang = target > 0 ? Math.max(0, target - menitKerja) : 0;
      const lemburMin = await setgInt('lembur_min_menit', 30);
      let lembur = target > 0 && menitKerja - target >= lemburMin ? menitKerja - target : 0;
      if ((buka.izin_sesi ?? '') !== '') lembur = 0;     // hari izin setengah hari tidak menghasilkan lembur
      /* pelanggaran jam inti (khusus mode fleksibel yang mengaktifkannya) */
      let langgar = 0;
      if ((buka.jam_mode ?? 'tetap') === 'fleksibel' && u.inti_mulai && u.inti_selesai) {
        const masuk = epoch(tglMasuk, buka.in_time), keluar = epoch(tgl, jam);
        const intiA = epoch(tglMasuk, u.inti_mulai); let intiB = epoch(tglMasuk, u.inti_selesai);
        if (intiB <= intiA) intiB += 86400;
        if (masuk > intiA || keluar < intiB) langgar = 1;
      }
      const file = foto !== '' ? await simpanFoto(foto, u.id, 'out') : '';
      await exec(`UPDATE absensi SET out_time=?,out_photo=?,out_lat=?,out_lng=?,out_jarak=?,out_luar=?,
        menit_kerja=?,kurang_menit=?,lembur_menit=?,langgar_inti=?,tgl_pulang=? WHERE id=?`,
        [jam, file, lat, lng, jarak, luar, menitKerja, kurang, lembur, langgar, lewatHari ? tgl : null, buka.id]);
      await logAksi(u.id, 'clock_out', jam + (lewatHari ? ' (lintas hari)' : ''));
      pesan = 'Clock out berhasil. Total kerja ' + jamTeks(menitKerja);
      if (kurang > 0) pesan += ` — kurang ${jamTeks(kurang)} dari target ${jamTeks(target)}`;
      else if (lembur > 0) pesan += ' — lembur ' + jamTeks(lembur);
      if (langgar) pesan += '. Catatan: di luar jam inti.';
      tglRow = tglMasuk;
    }
    const baru = await q1('SELECT * FROM absensi WHERE user_id=? AND tanggal=?', [u.id, tglRow]);
    return { pesan, hariIni: baru ? absRow(baru) : null };
  },

  async riwayat(m) {
    const u = await need();
    const bl = Math.max(1, Math.min(12, i(m, 'bulan', Number(tglWIB().slice(5, 7)))));
    const th = i(m, 'tahun', Number(tglWIB().slice(0, 4)));
    return (await q('SELECT * FROM absensi WHERE user_id=? AND YEAR(tanggal)=? AND MONTH(tanggal)=? ORDER BY tanggal DESC', [u.id, th, bl])).map(absRow);
  },

  /* titik awal karyawan lapangan */
  async set_titik_awal(m) {
    const u = await need();
    if ((await setgInt('titik_awal_oleh_admin', 1)) === 1 && !isAdminUp(u)) gagal('Titik awal hanya dapat diatur HC / Super Admin');
    const lat = f(m, 'lat'), lng = f(m, 'lng'), label = s(m, 'label', 'Titik awal');
    if (lat === null || lng === null) gagal('Koordinat tidak sah');
    await exec('UPDATE users SET base_lat=?,base_lng=?,base_label=?,base_set_by=?,base_set_at=NOW() WHERE id=?', [lat, lng, label, u.nama, u.id]);
    await logAksi(u.id, 'set_titik_awal', label);
    const baru = await q1('SELECT * FROM users WHERE id=?', [u.id]);
    return { me: await userPublik(baru!) };
  },
};
