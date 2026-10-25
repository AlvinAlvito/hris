/* =====================================================================
   PAYROLL — alur bulanan:
     1. HC menekan "Hitung" untuk periode YYYY-MM  -> draf slip
     2. penyesuaian (bonus, honor kegiatan, THR, koreksi) bila perlu;
        slip karyawan terkait dihitung ulang otomatis
     3. HC / Super Admin "Finalkan" -> slip terkunci & terlihat karyawan
     4. bila keliru, periode final TERAKHIR dapat "Dibuka kembali"
        (pencatatan kasbon & reimburse dari data lama ikut dibalik).
   Hari tidak hadir & setengah hari tanpa izin dipotong bila "potong_mangkir" aktif.
   Rumus pajak/BPJS/lembur ada di lib/pph21.ts (teruji tests/pph21.test.ts)
   ===================================================================== */
import { exec, nilai, q, q1, transaksi, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { hariKerjaSeminggu, jadwalHari, liburResmi, logAksi, need, rupiah, type User } from '@/lib/aturan';
import { setg, setSetting, settingsPublik } from '@/lib/pengaturan';
import { bendera, hariDalamBulan, periodeAkhir, periodeAwal, periodeSah, uang } from '@/lib/periode';
import { hitungBPJS, kategoriTER, pph21Tahunan, pph21TER, tarifTER, upahLembur, bulat, type SetelanBpjs } from '@/lib/pph21';
import { hitungStatus, statusHarian } from '@/lib/statusHarian';
import { selisihHari, tglWIB } from '@/lib/waktu';
import { hasilHalaman, paramHalaman } from '@/lib/paginasi';
import type { KumpulanAksi } from '../daftar';
import { beriTahu } from '@/lib/notifikasi';

const PERAN_PAYROLL = ['admin', 'finance', 'direktur'];
const KUNCI_SETELAN = ['bpjs_kes_p', 'bpjs_kes_k', 'bpjs_kes_batas', 'jht_p', 'jht_k', 'jkk', 'jkm', 'jp_p', 'jp_k', 'jp_batas',
  'lembur_pembagi', 'potong_mangkir', 'hari_kerja_sebulan', 'slip_catatan'];
const KODE_SISTEM = ['GAPOK', 'LEMBUR', 'ADJ', 'REIMB', 'MANGKIR', 'BPJSKES', 'JHT', 'JP', 'PKES', 'PJKK', 'PJKM', 'PJHT', 'PJP', 'KASBON', 'PPH21'];

type Setelan = SetelanBpjs & { lembur_pembagi: number; potong_mangkir: number; hari_kerja_sebulan: number; slip_catatan: string };
async function setelanPayroll(): Promise<Setelan> {
  const r: Baris = {};
  for (const k of KUNCI_SETELAN) r[k] = await setg(k, '');
  for (const k of ['bpjs_kes_p', 'bpjs_kes_k', 'jht_p', 'jht_k', 'jkk', 'jkm', 'jp_p', 'jp_k']) r[k] = parseFloat(r[k]) || 0;
  for (const k of ['bpjs_kes_batas', 'jp_batas', 'lembur_pembagi', 'potong_mangkir', 'hari_kerja_sebulan']) r[k] = parseInt(r[k], 10) || 0;
  if (r.lembur_pembagi <= 0) r.lembur_pembagi = 173;
  if (r.hari_kerja_sebulan <= 0) r.hari_kerja_sebulan = 22;
  return r as Setelan;
}
const periodeRow = (p: string) => q1('SELECT * FROM payroll_periode WHERE periode=?', [p]);
const komponenKaryawan = (uid: number) => q(`SELECT k.*, COALESCE(g.nominal,0) nominal FROM komponen_gaji k
  JOIN gaji_komponen g ON g.komponen_id=k.id AND g.user_id=? WHERE k.aktif=1 AND g.nominal<>0 ORDER BY k.urut, k.id`, [uid]);
const angkaJam = (x: number) => x.toFixed(2).replace('.', ',').replace(/0+$/, '').replace(/,$/, '');

interface BarisSlip { kode: string; nama: string; jenis: 'pendapatan' | 'potongan' | 'info'; nominal: number; pajak: boolean; ket: string; ref: number | null }

/* Hitung satu slip. status = peta status harian karyawan untuk periode.
   null bila karyawan tidak bekerja di periode tersebut. u = baris users + gaji_karyawan. */
async function hitungSlip(u: User, per: Baris, prm: Setelan, status: Record<string, string>) {
  const P: string = per.periode, awal = periodeAwal(P), akhir = periodeAkhir(P);
  const mulai = awal > u.tgl_masuk ? awal : u.tgl_masuk;
  const selesai = u.tgl_keluar && u.tgl_keluar < akhir ? u.tgl_keluar : akhir;
  if (mulai > selesai) return null;
  const hariKal = hariDalamBulan(P), hariKerja = selisihHari(mulai, selesai) + 1;
  const prorata = bulat(hariKerja / hariKal, 4);
  // setengah hari tanpa izin: tetap dihitung hadir (uang makan dsb.), gaji dipotong ½ hari
  const n = hitungStatus(status), hadir = n.hadir + n.telat + n.setengah, mangkir = n.mangkir + n.setengah / 2;

  const baris: BarisSlip[] = [];
  const tambah = (kode: string, nama: string, jenis: BarisSlip['jenis'], nominal: number, pajak: boolean, ket = '', ref: number | null = null) => {
    if (nominal !== 0) baris.push({ kode, nama, jenis, nominal, pajak, ket, ref });
  };

  const gapokPenuh = Number(u.gaji_pokok), gapok = bulat(gapokPenuh * prorata);
  tambah('GAPOK', 'Gaji Pokok', 'pendapatan', gapok, true, prorata < 1 ? `prorata ${hariKerja}/${hariKal} hari` : '');

  let tetap = 0;                                   // tunjangan tetap -> dasar BPJS & upah lembur
  for (const k of await komponenKaryawan(u.id)) {
    const nom = Number(k.nominal);
    if (k.jenis === 'tunjangan') {
      if (k.hitung === 'per_hadir') tambah(k.kode, k.nama, 'pendapatan', nom * hadir, !!k.kena_pajak, `${hadir} hari × ${rupiah(nom)}`);
      else {
        tambah(k.kode, k.nama, 'pendapatan', bulat(nom * prorata), !!k.kena_pajak);
        if (Number(k.masuk_bpjs) === 1) tetap += nom;
      }
    } else tambah(k.kode, k.nama, 'potongan', k.hitung === 'per_hadir' ? nom * hadir : nom, false);
  }
  const upahBulan = gapokPenuh + tetap;

  /* lembur resmi (pengajuan lembur yang disetujui) */
  if (Number(u.dapat_lembur) === 1) {
    let totLembur = 0, totJam = 0;
    const hk = await hariKerjaSeminggu();
    for (const l of await q("SELECT tanggal, menit FROM pengajuan WHERE user_id=? AND jenis='lembur' AND status='Disetujui' AND tanggal BETWEEN ? AND ? ORDER BY tanggal", [u.id, awal, akhir])) {
      const libur = (await jadwalHari(u, l.tanggal)).libur || (await liburResmi(l.tanggal)) !== null;
      const h = upahLembur(Number(l.menit), upahBulan, libur, prm.lembur_pembagi, hk);
      totLembur += h.nominal; totJam += h.jam;
    }
    tambah('LEMBUR', 'Upah Lembur', 'pendapatan', totLembur, true, angkaJam(totJam) + ' jam');
  }

  /* penyesuaian periode ini */
  for (const x of await q('SELECT * FROM payroll_penyesuaian WHERE periode_id=? AND user_id=? ORDER BY id', [per.id, u.id]))
    tambah('ADJ', x.nama, x.jenis === 'tunjangan' ? 'pendapatan' : 'potongan', Number(x.nominal), x.jenis === 'tunjangan' && Number(x.kena_pajak) === 1, 'penyesuaian', x.id);

  /* potongan mangkir (bila diaktifkan di pengaturan) */
  let potMangkir = 0;
  if (prm.potong_mangkir === 1 && mangkir > 0) {
    potMangkir = bulat(upahBulan / prm.hari_kerja_sebulan) * mangkir;
    potMangkir = bulat(potMangkir);
    const ket = [n.mangkir ? `${n.mangkir} hari tidak hadir` : '', n.setengah ? `${n.setengah}× setengah hari tanpa izin` : ''].filter(Boolean).join(' + ');
    tambah('MANGKIR', 'Potongan Tidak Hadir', 'potongan', potMangkir, true, ket);
  }

  /* BPJS — dasar upah bulanan penuh (atau dasar manual) */
  const dasar = u.dasar_bpjs !== null && Number(u.dasar_bpjs) > 0 ? Number(u.dasar_bpjs) : upahBulan;
  const bp = hitungBPJS(dasar, prm, Number(u.ikut_bpjs_kes) === 1, Number(u.ikut_bpjs_tk) === 1, Number(u.ikut_jp) === 1);
  tambah('BPJSKES', 'BPJS Kesehatan (1%)', 'potongan', bp.kesK, false);
  tambah('JHT', 'BPJS JHT (2%)', 'potongan', bp.jhtK, false);
  tambah('JP', 'BPJS Jaminan Pensiun (1%)', 'potongan', bp.jpK, false);
  // porsi pemberi kerja: informasi di slip
  tambah('PKES', 'BPJS Kesehatan ditanggung perusahaan', 'info', bp.kesP, true);
  tambah('PJKK', 'JKK ditanggung perusahaan', 'info', bp.jkk, true);
  tambah('PJKM', 'JKM ditanggung perusahaan', 'info', bp.jkm, true);
  tambah('PJHT', 'JHT ditanggung perusahaan', 'info', bp.jhtP, false);
  tambah('PJP', 'JP ditanggung perusahaan', 'info', bp.jpP, false);

  /* penghasilan bruto untuk pajak: pendapatan kena pajak + premi JKK, JKM, BPJS Kes pemberi kerja */
  let bruto = 0;
  for (const x of baris) if (x.pajak && (x.jenis === 'pendapatan' || x.jenis === 'info')) bruto += x.nominal;
  bruto = Math.max(0, bruto - potMangkir);
  const iuran = bp.jhtK + bp.jpK;

  /* PPh 21 */
  let pph = 0, metode = 'Tidak dipotong', detailPajak: Baris | null = null;
  const masaTerakhir = P.slice(5) === '12' || (!!u.tgl_keluar && u.tgl_keluar.slice(0, 7) === P);
  if (Number(u.kena_pph21) === 1) {
    if (!masaTerakhir) {
      pph = pph21TER(u.ptkp, bruto);
      metode = `TER ${kategoriTER(u.ptkp)} ${String(tarifTER(u.ptkp, bruto)).replace('.', ',')}%`;
    } else {
      const lalu = (await q1(`SELECT COALESCE(SUM(s.bruto_pajak),0) b, COALESCE(SUM(s.pph21),0) p, COALESCE(SUM(s.iuran_pegawai),0) i, COUNT(*) n
        FROM payroll_slip s JOIN payroll_periode pp ON pp.id=s.periode_id WHERE s.user_id=? AND pp.periode LIKE ? AND pp.periode < ?`, [u.id, P.slice(0, 4) + '-%', P]))!;
      const sa = (await q1('SELECT * FROM pajak_saldo_awal WHERE user_id=? AND tahun=?', [u.id, +P.slice(0, 4)])) ?? { bruto: 0, pph21: 0, iuran: 0, bulan: 0 };
      const t = pph21Tahunan(Number(lalu.b) + Number(sa.bruto) + bruto, Number(lalu.i) + Number(sa.iuran) + iuran,
        Number(lalu.n) + Number(sa.bulan) + 1, u.ptkp, Number(lalu.p) + Number(sa.pph21));
      pph = t.pphBulanIni; metode = 'Pasal 17 (masa pajak terakhir)'; detailPajak = t;
    }
  }
  if (pph > 0) tambah('PPH21', 'PPh Pasal 21', 'potongan', pph, false, metode);
  if (pph < 0) tambah('PPH21', 'Pengembalian kelebihan PPh 21', 'pendapatan', -pph, false, metode);

  let pend = 0, pot = 0;
  for (const x of baris) { if (x.jenis === 'pendapatan') pend += x.nominal; else if (x.jenis === 'potongan') pot += x.nominal; }
  return {
    gaji_pokok: gapok, prorata, hari_hadir: hadir, hari_mangkir: n.mangkir, total_pendapatan: pend, total_potongan: pot,
    bruto_pajak: bruto, pph21: pph, pph21_metode: metode, iuran_pegawai: iuran,
    bpjs_perusahaan: bp.kesP + bp.jhtP + bp.jkk + bp.jkm + bp.jpP, thp: pend - pot, ptkp: u.ptkp,
    rincian: JSON.stringify({ baris, pajak: detailPajak, statusHari: n, dasarBpjs: dasar, upahLembur: upahBulan }),
  };
}

/* hitung & simpan slip untuk semua karyawan (atau satu karyawan) pada periode draf */
async function hitungPeriode(per: Baris, hanyaUser: number | null = null) {
  const prm = await setelanPayroll();
  const users = await q(`SELECT u.*, g.gaji_pokok, g.ptkp, g.ikut_bpjs_kes, g.ikut_bpjs_tk, g.ikut_jp, g.dasar_bpjs, g.dapat_lembur, g.kena_pph21
    FROM users u JOIN gaji_karyawan g ON g.user_id=u.id WHERE g.gaji_pokok > 0` + (hanyaUser ? ' AND u.id=?' : ''), hanyaUser ? [hanyaUser] : []);
  const status = await statusHarian(users, periodeAwal(per.periode), periodeAkhir(per.periode));  // tanggal yang belum lewat berstatus 'luar'
  const hasil = { slip: 0, thp: 0, tanpaRekening: [] as string[], dilewati: [] as string[] };
  for (const u of users) {
    await exec('DELETE FROM payroll_slip WHERE periode_id=? AND user_id=?', [per.id, u.id]);
    if (Number(u.aktif) !== 1 && !u.tgl_keluar) { hasil.dilewati.push(u.nama + ' (nonaktif)'); continue; }
    const sl = await hitungSlip(u, per, prm, status[u.id] ?? {});
    if (!sl) { hasil.dilewati.push(u.nama + ' (di luar masa kerja)'); continue; }
    await exec(`INSERT INTO payroll_slip (periode_id,user_id,gaji_pokok,prorata,hari_hadir,hari_mangkir,total_pendapatan,total_potongan,
      bruto_pajak,pph21,pph21_metode,iuran_pegawai,bpjs_perusahaan,thp,ptkp,rincian) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [per.id, u.id, sl.gaji_pokok, sl.prorata, sl.hari_hadir, sl.hari_mangkir, sl.total_pendapatan, sl.total_potongan, sl.bruto_pajak,
      sl.pph21, sl.pph21_metode, sl.iuran_pegawai, sl.bpjs_perusahaan, sl.thp, sl.ptkp, sl.rincian]);
    hasil.slip++; hasil.thp += sl.thp;
    if (String(u.bank_rekening ?? '').trim() === '') hasil.tanpaRekening.push(u.nama);
  }
  return hasil;
}

function slipRow(r: Baris, lengkap = true) {
  const o: Baris = {
    id: r.id, userId: r.user_id, nama: r.nama ?? '', nik: r.nik ?? '', jabatan: r.jabatan ?? '', dept: r.dept ?? '', cabang: r.cnama ?? '',
    npwp: r.npwp ?? '', bankNama: r.bank_nama ?? '', bankRekening: r.bank_rekening ?? '', bankAtasNama: r.bank_atas_nama ?? '',
    periode: r.periode ?? '', statusPeriode: r.pstatus ?? '', gajiPokok: Number(r.gaji_pokok), prorata: Number(r.prorata),
    hariHadir: Number(r.hari_hadir), hariMangkir: Number(r.hari_mangkir), totalPendapatan: Number(r.total_pendapatan), totalPotongan: Number(r.total_potongan),
    brutoPajak: Number(r.bruto_pajak), pph21: Number(r.pph21), pph21Metode: r.pph21_metode, iuranPegawai: Number(r.iuran_pegawai),
    bpjsPerusahaan: Number(r.bpjs_perusahaan), thp: Number(r.thp), ptkp: r.ptkp,
  };
  if (lengkap) o.rincian = typeof r.rincian === 'string' ? JSON.parse(r.rincian) : r.rincian;
  return o;
}
const SQL_SLIP = `SELECT s.*, u.nama, u.nik, u.jabatan, u.dept, u.npwp, u.bank_nama, u.bank_rekening, u.bank_atas_nama,
    c.nama cnama, p.periode, p.status pstatus
  FROM payroll_slip s JOIN users u ON u.id=s.user_id JOIN payroll_periode p ON p.id=s.periode_id LEFT JOIN cabang c ON c.id=u.cabang_id`;
const periodeAda = async (p: string) => (await periodeRow(p)) ?? gagal('Periode belum dihitung');

export const aksiPayroll: KumpulanAksi = {
  /* ---------- pengaturan tarif ---------- */
  async py_setelan() { await need(PERAN_PAYROLL); return setelanPayroll(); },
  async py_setelan_simpan(m) {
    const u = await need(PERAN_PAYROLL);
    for (const k of KUNCI_SETELAN) {
      if (!(k in m)) continue;
      const v = String(m[k] ?? '').trim();
      if (k !== 'slip_catatan' && (v === '' || !Number.isFinite(Number(v)) || Number(v) < 0)) gagal('Nilai tidak sah untuk ' + k);
      await setSetting(k, k === 'slip_catatan' ? v.slice(0, 255) : v);
    }
    await logAksi(u.id, 'ubah_setelan_payroll');
    return { pesan: 'Pengaturan payroll tersimpan', setelan: await setelanPayroll() };
  },

  /* ---------- komponen gaji ---------- */
  async py_komponen() {
    await need(PERAN_PAYROLL);
    return (await q('SELECT * FROM komponen_gaji ORDER BY aktif DESC, urut, id')).map((k) => ({
      id: k.id, kode: k.kode, nama: k.nama, jenis: k.jenis, hitung: k.hitung, kenaPajak: Number(k.kena_pajak) === 1,
      masukBpjs: Number(k.masuk_bpjs) === 1, aktif: Number(k.aktif) === 1, urut: k.urut }));
  },
  async py_komponen_simpan(m) {
    const u = await need(PERAN_PAYROLL);
    const id = i(m, 'id'), kode = s(m, 'kode').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12), nama = s(m, 'nama');
    if (kode === '' || nama === '') gagal('Kode dan nama komponen wajib diisi');
    if (KODE_SISTEM.includes(kode)) gagal(`Kode ${kode} dipakai sistem, gunakan kode lain`);
    const jenis = s(m, 'jenis', 'tunjangan'), hitung = s(m, 'hitung', 'bulanan');
    if (!['tunjangan', 'potongan'].includes(jenis) || !['bulanan', 'per_hadir'].includes(hitung)) gagal('Pilihan tidak sah');
    if (await nilai('SELECT id FROM komponen_gaji WHERE kode=? AND id<>?', [kode, id])) gagal('Kode komponen sudah dipakai');
    const data = [kode, nama.slice(0, 80), jenis, hitung, bendera(m, 'kenaPajak', false) ? 1 : 0, bendera(m, 'masukBpjs', false) ? 1 : 0,
      bendera(m, 'aktif', true) ? 1 : 0, i(m, 'urut', 50)];
    if (id) await exec('UPDATE komponen_gaji SET kode=?,nama=?,jenis=?,hitung=?,kena_pajak=?,masuk_bpjs=?,aktif=?,urut=? WHERE id=?', [...data, id]);
    else await exec('INSERT INTO komponen_gaji (kode,nama,jenis,hitung,kena_pajak,masuk_bpjs,aktif,urut) VALUES (?,?,?,?,?,?,?,?)', data);
    await logAksi(u.id, 'simpan_komponen_gaji', kode);
    return { pesan: 'Komponen tersimpan' };
  },

  /* ---------- data gaji per karyawan ---------- */
  async py_gaji_daftar() {
    await need(PERAN_PAYROLL);
    const rows = await q(`SELECT u.id, u.nik, u.nama, u.jabatan, u.dept, u.role, u.aktif, u.status_kerja, u.tgl_masuk, u.tgl_keluar,
        u.bank_nama, u.bank_rekening, u.npwp, u.status_nikah, c.nama cnama,
        g.gaji_pokok, g.ptkp, g.ikut_bpjs_kes, g.ikut_bpjs_tk, g.ikut_jp, g.dasar_bpjs, g.dapat_lembur, g.kena_pph21, g.diubah_oleh, g.updated_at
      FROM users u LEFT JOIN gaji_karyawan g ON g.user_id=u.id LEFT JOIN cabang c ON c.id=u.cabang_id
      WHERE u.aktif=1 OR u.tgl_keluar >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH) ORDER BY u.nama`);
    const komp: Record<number, Record<number, number>> = {};
    for (const r of await q('SELECT user_id, komponen_id, nominal FROM gaji_komponen')) (komp[r.user_id] ??= {})[r.komponen_id] = Number(r.nominal);
    const ya = (v: unknown) => v === null || Number(v) === 1;   // belum terdaftar = bawaan ikut
    return rows.map((r) => ({
      id: r.id, nik: r.nik, nama: r.nama, jabatan: r.jabatan, dept: r.dept, role: r.role, aktif: Number(r.aktif) === 1, cabang: r.cnama ?? '',
      statusKerja: r.status_kerja, tglMasuk: r.tgl_masuk, tglKeluar: r.tgl_keluar, bankNama: r.bank_nama, bankRekening: r.bank_rekening, npwp: r.npwp,
      terdaftar: r.gaji_pokok !== null, gajiPokok: Number(r.gaji_pokok ?? 0), ptkp: r.ptkp || 'TK/0',
      ikutBpjsKes: ya(r.ikut_bpjs_kes), ikutBpjsTk: ya(r.ikut_bpjs_tk), ikutJp: ya(r.ikut_jp),
      dasarBpjs: r.dasar_bpjs !== null ? Number(r.dasar_bpjs) : null, dapatLembur: ya(r.dapat_lembur), kenaPph21: ya(r.kena_pph21),
      diubahOleh: r.diubah_oleh ?? '', diubahPada: r.updated_at ?? null, komponen: komp[r.id] ?? {},
    }));
  },
  async py_gaji_simpan(m) {
    const u = await need(PERAN_PAYROLL);
    const uid = i(m, 'userId');
    const nama = (await nilai<string>('SELECT nama FROM users WHERE id=?', [uid])) ?? gagal('Karyawan tidak ditemukan');
    const gapok = uang(m, 'gajiPokok');
    if (gapok < 0 || gapok > 10000000000) gagal('Gaji pokok tidak sah');
    const ptkp = s(m, 'ptkp', 'TK/0');
    if (!/^(TK|K)\/[0-3]$/.test(ptkp)) gagal('Status PTKP tidak sah');
    const dasar = String(m.dasarBpjs ?? '').trim() === '' ? null : uang(m, 'dasarBpjs');
    const lama = await nilai('SELECT gaji_pokok FROM gaji_karyawan WHERE user_id=?', [uid]);
    const komponen = m.komponen && typeof m.komponen === 'object' ? Object.entries(m.komponen as Record<string, unknown>) : [];
    for (const [, nom] of komponen) if (parseInt(String(nom).replace(/[^\d-]/g, ''), 10) < 0) gagal('Nominal komponen tidak boleh negatif');
    await transaksi(async () => {
      await exec(`INSERT INTO gaji_karyawan (user_id,gaji_pokok,ptkp,ikut_bpjs_kes,ikut_bpjs_tk,ikut_jp,dasar_bpjs,dapat_lembur,kena_pph21,diubah_oleh)
        VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE gaji_pokok=VALUES(gaji_pokok), ptkp=VALUES(ptkp), ikut_bpjs_kes=VALUES(ikut_bpjs_kes),
        ikut_bpjs_tk=VALUES(ikut_bpjs_tk), ikut_jp=VALUES(ikut_jp), dasar_bpjs=VALUES(dasar_bpjs), dapat_lembur=VALUES(dapat_lembur),
        kena_pph21=VALUES(kena_pph21), diubah_oleh=VALUES(diubah_oleh)`,
      [uid, gapok, ptkp, +bendera(m, 'ikutBpjsKes', true), +bendera(m, 'ikutBpjsTk', true), +bendera(m, 'ikutJp', true), dasar,
        +bendera(m, 'dapatLembur', true), +bendera(m, 'kenaPph21', true), u.nama]);
      for (const [kid, nom] of komponen)
        await exec('INSERT INTO gaji_komponen (user_id,komponen_id,nominal) VALUES (?,?,?) ON DUPLICATE KEY UPDATE nominal=VALUES(nominal)',
          [uid, parseInt(kid, 10), parseInt(String(nom).replace(/[^\d-]/g, ''), 10) || 0]);
    });
    await logAksi(u.id, 'ubah_gaji', nama + (lama !== null && Number(lama) !== gapok ? `: ${rupiah(Number(lama))} → ${rupiah(gapok)}` : ''));
    return { pesan: `Data gaji ${nama} tersimpan` };
  },

  /* ---------- saldo awal pajak (bila aplikasi mulai dipakai di tengah tahun) ---------- */
  async py_saldo_awal(m) {
    await need(PERAN_PAYROLL);
    const th = i(m, 'tahun', +tglWIB().slice(0, 4));
    return (await q('SELECT s.*, u.nama, u.nik FROM pajak_saldo_awal s JOIN users u ON u.id=s.user_id WHERE s.tahun=? ORDER BY u.nama', [th])).map((r) => ({
      userId: r.user_id, nama: r.nama, nik: r.nik, tahun: r.tahun, bruto: Number(r.bruto), pph21: Number(r.pph21), iuran: Number(r.iuran), bulan: r.bulan }));
  },
  async py_saldo_awal_simpan(m) {
    const u = await need(PERAN_PAYROLL);
    const bulan = i(m, 'bulan');
    if (bulan < 0 || bulan > 11) gagal('Jumlah bulan 0–11');
    await exec(`INSERT INTO pajak_saldo_awal (user_id,tahun,bruto,pph21,iuran,bulan) VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE bruto=VALUES(bruto), pph21=VALUES(pph21), iuran=VALUES(iuran), bulan=VALUES(bulan)`,
    [i(m, 'userId'), i(m, 'tahun', +tglWIB().slice(0, 4)), uang(m, 'bruto'), uang(m, 'pph21'), uang(m, 'iuran'), bulan]);
    await logAksi(u.id, 'saldo_awal_pajak', '#' + i(m, 'userId'));
    return { pesan: 'Saldo awal tersimpan' };
  },

  /* ---------- periode ---------- */
  async py_periode_daftar() {
    await need(PERAN_PAYROLL);
    return (await q(`SELECT p.*, COUNT(s.id) n, COALESCE(SUM(s.thp),0) thp, COALESCE(SUM(s.bruto_pajak),0) bruto,
        COALESCE(SUM(s.pph21),0) pph, COALESCE(SUM(s.bpjs_perusahaan),0) bpjsp
      FROM payroll_periode p LEFT JOIN payroll_slip s ON s.periode_id=p.id GROUP BY p.id ORDER BY p.periode DESC`)).map((r) => ({
      id: r.id, periode: r.periode, status: r.status, catatan: r.catatan, dibuatOleh: r.dibuat_oleh, tglHitung: r.tgl_hitung,
      finalOleh: r.final_oleh, tglFinal: r.tgl_final, jumlahSlip: Number(r.n), totalThp: Number(r.thp), totalBruto: Number(r.bruto),
      totalPph: Number(r.pph), totalBpjsPerusahaan: Number(r.bpjsp) }));
  },
  async py_hitung(m) {
    const u = await need(PERAN_PAYROLL);
    const P = s(m, 'periode');
    if (!periodeSah(P)) gagal('Periode tidak sah (format YYYY-MM)');
    const ada = await periodeRow(P);
    if (ada?.status === 'final') gagal(`Periode ${P} sudah final. Buka kembali dulu bila perlu dihitung ulang.`);
    const h = await transaksi(async () => {
      if (!ada) await exec('INSERT INTO payroll_periode (periode, dibuat_oleh) VALUES (?,?)', [P, u.nama]);
      const per = (await periodeRow(P))!;
      const h = await hitungPeriode(per);
      await exec('UPDATE payroll_periode SET tgl_hitung=NOW(), dibuat_oleh=? WHERE id=?', [u.nama, per.id]);
      return h;
    });
    await logAksi(u.id, 'hitung_payroll', `${P} · ${h.slip} slip`);
    return { pesan: `${h.slip} slip dihitung untuk periode ${P} — total THP ${rupiah(h.thp)}`, ringkas: h };
  },
  async py_periode(m) {
    await need(PERAN_PAYROLL);
    const per = await periodeAda(s(m, 'periode'));
    const slip = (await q(SQL_SLIP + ' WHERE s.periode_id=? ORDER BY u.nama', [per.id])).map((r) => slipRow(r));
    const penyesuaian = (await q('SELECT x.*, u.nama karyawan FROM payroll_penyesuaian x JOIN users u ON u.id=x.user_id WHERE x.periode_id=? ORDER BY u.nama, x.id', [per.id]))
      .map((x) => ({ id: x.id, userId: x.user_id, karyawan: x.karyawan, nama: x.nama, jenis: x.jenis, nominal: Number(x.nominal), kenaPajak: Number(x.kena_pajak) === 1, oleh: x.dibuat_oleh }));
    return { periode: { id: per.id, periode: per.periode, status: per.status, dibuatOleh: per.dibuat_oleh, tglHitung: per.tgl_hitung,
      finalOleh: per.final_oleh, tglFinal: per.tgl_final }, slip, penyesuaian };
  },
  async py_penyesuaian_simpan(m) {
    const u = await need(PERAN_PAYROLL);
    const per = (await periodeRow(s(m, 'periode'))) ?? gagal('Hitung periode ini dulu sebelum menambah penyesuaian');
    if (per.status === 'final') gagal('Periode sudah final');
    const uid = i(m, 'userId'), nama = s(m, 'nama'), nom = uang(m, 'nominal'), jenis = s(m, 'jenis', 'tunjangan');
    if (nama === '' || nom <= 0) gagal('Nama dan nominal penyesuaian wajib diisi');
    if (!['tunjangan', 'potongan'].includes(jenis)) gagal('Jenis tidak sah');
    if (!(await nilai('SELECT 1 FROM gaji_karyawan WHERE user_id=? AND gaji_pokok>0', [uid]))) gagal('Karyawan ini belum memiliki data gaji');
    await transaksi(async () => {
      // kolom nama = keterangan baris slip
      await exec('INSERT INTO payroll_penyesuaian (periode_id,user_id,nama,jenis,nominal,kena_pajak,dibuat_oleh) VALUES (?,?,?,?,?,?,?)',
        [per.id, uid, nama.slice(0, 100), jenis, nom, +bendera(m, 'kenaPajak', true), u.nama]);
      await hitungPeriode(per, uid);
    });
    await logAksi(u.id, 'penyesuaian_payroll', `${per.periode} #${uid} ${nama} ${rupiah(nom)}`);
    return { pesan: 'Penyesuaian ditambahkan & slip dihitung ulang' };
  },
  async py_penyesuaian_hapus(m) {
    const u = await need(PERAN_PAYROLL);
    const x = (await q1('SELECT x.*, p.status, p.periode FROM payroll_penyesuaian x JOIN payroll_periode p ON p.id=x.periode_id WHERE x.id=?', [i(m, 'id')]))
      ?? gagal('Penyesuaian tidak ditemukan');
    if (x.status === 'final') gagal('Periode sudah final');
    await transaksi(async () => {
      await exec('DELETE FROM payroll_penyesuaian WHERE id=?', [x.id]);
      await hitungPeriode((await periodeRow(x.periode))!, x.user_id);
    });
    await logAksi(u.id, 'hapus_penyesuaian', '#' + x.id);
    return { pesan: 'Penyesuaian dihapus & slip dihitung ulang' };
  },
  async py_finalkan(m) {
    const u = await need(['finance', 'direktur']);
    const per = await periodeAda(s(m, 'periode'));
    if (per.status === 'final') gagal('Periode sudah final');
    if (!Number(await nilai('SELECT COUNT(*) FROM payroll_slip WHERE periode_id=?', [per.id]))) gagal('Belum ada slip pada periode ini');
    await transaksi(async () => {
      await exec("UPDATE payroll_periode SET status='final', final_oleh=?, tgl_final=NOW(), catatan=? WHERE id=?", [u.nama, s(m, 'catatan').slice(0, 255), per.id]);
    });
    await logAksi(u.id, 'finalkan_payroll', per.periode);
    const pemilik = (await q('SELECT user_id FROM payroll_slip WHERE periode_id=?', [per.id])).map((x) => x.user_id as number);
    await beriTahu(pemilik, { jenis: 'payroll', tautan: '/slip', kunci: `slip:${per.periode}`, judul: `Slip gaji ${per.periode} sudah terbit`, isi: 'Buka menu Slip Gaji untuk melihat rinciannya.' });
    return { pesan: `Payroll ${per.periode} final. Slip sudah dapat dilihat karyawan.` };
  },
  async py_buka(m) {
    const u = await need(['finance', 'direktur']);
    const per = await periodeRow(s(m, 'periode'));
    if (!per || per.status !== 'final') gagal('Periode ini tidak dalam status final');
    if (Number(await nilai("SELECT COUNT(*) FROM payroll_periode WHERE status='final' AND periode>?", [per.periode])) > 0)
      gagal('Hanya periode final TERAKHIR yang dapat dibuka kembali');
    const alasan = s(m, 'alasan');
    if (alasan === '') gagal('Tuliskan alasan membuka kembali periode ini');
    await transaksi(async () => {
      // balikkan cicilan kasbon yang dicatat dari slip periode ini
      for (const bb of await q("SELECT b.* FROM kasbon_bayar b JOIN payroll_slip s ON s.id=b.slip_id WHERE s.periode_id=? AND b.sumber='gaji'", [per.id])) {
        await exec("UPDATE kasbon SET terbayar=GREATEST(0, terbayar-?), status=IF(status='Lunas','Aktif',status) WHERE id=?", [bb.nominal, bb.kasbon_id]);
        await exec('DELETE FROM kasbon_bayar WHERE id=?', [bb.id]);
      }
      await exec("UPDATE reimburse SET status='Disetujui', tgl_bayar=NULL WHERE metode_bayar='gaji' AND periode_gaji=? AND status='Dibayar'", [per.periode]);
      await exec("UPDATE payroll_periode SET status='draft', catatan=? WHERE id=?", [('Dibuka kembali: ' + alasan).slice(0, 255), per.id]);
    });
    await logAksi(u.id, 'buka_payroll', `${per.periode} — ${alasan}`);
    return { pesan: `Periode ${per.periode} dibuka kembali sebagai draf` };
  },

  /* ---------- slip untuk karyawan ---------- */
  async py_slip_saya(m) {
    const u = await need();
    const pg = paramHalaman(m);
    let where = " WHERE s.user_id=? AND p.status='final'";
    const args: any[] = [u.id];
    const cari = pg.cari.replace(/[\\%_]/g, '');
    if (cari) { where += ' AND p.periode LIKE ?'; args.push(`%${cari}%`); }
    const count = await q1('SELECT COUNT(*) n FROM payroll_slip s JOIN payroll_periode p ON p.id=s.periode_id' + where, args);
    const rows = await q(SQL_SLIP + where + ' ORDER BY p.periode DESC LIMIT 8 OFFSET ?', [...args, pg.offset]);
    return hasilHalaman(rows.map((r) => slipRow(r, false)), Number(count?.n ?? 0), pg.page);
  },
  async py_slip(m) {
    const u = await need();
    const sl = await q1(SQL_SLIP + ' WHERE s.id=?', [i(m, 'id')]);
    if (!sl) gagal('Slip tidak ditemukan');
    const milik = sl.user_id === u.id;
    if (!PERAN_PAYROLL.includes(u.role) && !(milik && sl.pstatus === 'final')) gagal('Slip tidak ditemukan', 404);
    const sp = await settingsPublik();
    return { slip: slipRow(sl), perusahaan: sp.perusahaan, logo: sp.logo, catatan: await setg('slip_catatan', '') };
  },

  /* ---------- ringkasan untuk grafik ---------- */
  async py_ringkasan() {
    await need(PERAN_PAYROLL);
    const per = await q(`SELECT p.periode, p.status, COALESCE(SUM(s.thp),0) thp, COALESCE(SUM(s.pph21),0) pph, COALESCE(SUM(s.bpjs_perusahaan),0) bpjs, COUNT(s.id) n
      FROM payroll_periode p LEFT JOIN payroll_slip s ON s.periode_id=p.id GROUP BY p.id ORDER BY p.periode DESC LIMIT 12`);
    const dept = await q(`SELECT p.periode, COALESCE(NULLIF(u.dept,''),'Lainnya') dept, SUM(s.thp + s.bpjs_perusahaan) biaya
      FROM payroll_slip s JOIN payroll_periode p ON p.id=s.periode_id JOIN users u ON u.id=s.user_id
      WHERE p.periode >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), '%Y-%m') GROUP BY p.periode, dept ORDER BY p.periode`);
    return {
      periode: per.reverse().map((r) => ({ periode: r.periode, status: r.status, thp: Number(r.thp), pph: Number(r.pph), bpjs: Number(r.bpjs), jumlah: Number(r.n) })),
      perDept: dept.map((r) => ({ periode: r.periode, dept: r.dept, biaya: Number(r.biaya) })),
    };
  },
};
