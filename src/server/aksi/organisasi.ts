/* Master struktur organisasi: unit organisasi bertingkat (Direksi › Divisi › Departemen › Unit) dan jabatan.
   Karyawan memilih unit & jabatan dari master ini; namanya disalin ke users.dept / users.jabatan
   agar laporan, payroll, dan ekspor lama tetap membaca teks yang sama. */
import { exec, nilai, q, q1, transaksi, type Baris } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { logAksi, need } from '@/lib/aturan';
import { setg, setSetting } from '@/lib/pengaturan';
import type { KumpulanAksi } from '../daftar';

const TINGKAT = ['direksi', 'divisi', 'departemen', 'unit'];
const JENIS_JABATAN = ['struktural', 'fungsional', 'staf'];
const POLA_STRUKTURAL = /direk|direksi|manager|manajer|supervisor|leader|kepala|koordinator|head|ketua/i;

/* Sekali saja: bentuk master dari isian teks dept & jabatan karyawan yang sudah ada */
async function sinkronAwal(): Promise<void> {
  if ((await setg('org_sinkron', '0')) === '1') return;
  await transaksi(async () => {
    if (!Number(await nilai('SELECT COUNT(*) FROM unit_organisasi'))) {
      const dept = (await q("SELECT DISTINCT TRIM(dept) nama FROM users WHERE TRIM(dept)<>'' ORDER BY nama")).map((r) => String(r.nama));
      const direksi = dept.find((d) => /^direksi$/i.test(d));
      let idDireksi: number | null = null;
      if (direksi) idDireksi = (await exec("INSERT INTO unit_organisasi (nama,tingkat) VALUES (?,'direksi')", [direksi])).insertId;
      for (const d of dept) if (d !== direksi) await exec("INSERT INTO unit_organisasi (nama,tingkat,induk_id) VALUES (?,'divisi',?)", [d, idDireksi]);
      await exec('UPDATE users u JOIN unit_organisasi o ON o.nama=TRIM(u.dept) SET u.unit_id=o.id WHERE u.unit_id IS NULL');
    }
    if (!Number(await nilai('SELECT COUNT(*) FROM jabatan'))) {
      const pasangan = await q("SELECT TRIM(jabatan) nama, unit_id, COUNT(*) n FROM users WHERE TRIM(jabatan)<>'' GROUP BY TRIM(jabatan), unit_id ORDER BY nama");
      for (const p of pasangan)
        await exec('INSERT INTO jabatan (nama,unit_id,jenis) VALUES (?,?,?)', [p.nama, p.unit_id, POLA_STRUKTURAL.test(p.nama) ? 'struktural' : 'staf']);
      await exec('UPDATE users u JOIN jabatan j ON j.nama=TRIM(u.jabatan) AND j.unit_id <=> u.unit_id SET u.jabatan_id=j.id WHERE u.jabatan_id IS NULL');
      // jabatan atasan: jabatan yang paling sering dipegang atasan langsung para pemegangnya
      for (const r of await q(`SELECT u.jabatan_id jid, a.jabatan_id aid, COUNT(*) n FROM users u JOIN users a ON a.id=u.atasan_id
        WHERE u.jabatan_id IS NOT NULL AND a.jabatan_id IS NOT NULL AND a.jabatan_id<>u.jabatan_id GROUP BY u.jabatan_id, a.jabatan_id ORDER BY n DESC`))
        await exec('UPDATE jabatan SET atasan_jabatan_id=? WHERE id=? AND atasan_jabatan_id IS NULL', [r.aid, r.jid]);
    }
    await setSetting('org_sinkron', 1);
  });
}

/* tidak boleh melingkar: calon induk tidak boleh berada di bawah dirinya */
async function cekLingkar(tabel: 'unit_organisasi' | 'jabatan', kolom: string, id: number, induk: number | null): Promise<void> {
  let jalur = induk, langkah = 0;
  while (jalur && langkah++ < 100) {
    if (jalur === id) gagal('Struktur melingkar: induk yang dipilih berada di bawah data ini');
    const r: Baris | null = await q1(`SELECT ${kolom} p FROM ${tabel} WHERE id=?`, [jalur]);
    jalur = r?.p ?? null;
  }
}

export const aksiOrganisasi: KumpulanAksi = {
  async org_data() {
    await need(['admin']);
    await sinkronAwal();
    const unit = await q(`SELECT o.*, p.nama induk_nama,
        (SELECT COUNT(*) FROM unit_organisasi c WHERE c.induk_id=o.id) sub,
        (SELECT COUNT(*) FROM users u WHERE u.unit_id=o.id AND u.aktif=1) langsung,
        (SELECT COUNT(*) FROM jabatan j WHERE j.unit_id=o.id) jml_jabatan
      FROM unit_organisasi o LEFT JOIN unit_organisasi p ON p.id=o.induk_id ORDER BY FIELD(o.tingkat,'direksi','divisi','departemen','unit'), o.nama`);
    // total karyawan termasuk seluruh unit di bawahnya
    const anak = new Map<number, number[]>();
    for (const o of unit) if (o.induk_id) { if (!anak.has(o.induk_id)) anak.set(o.induk_id, []); anak.get(o.induk_id)!.push(o.id); }
    const langsung = new Map(unit.map((o) => [o.id as number, Number(o.langsung)]));
    const total = (id: number, jejak = new Set<number>()): number => {
      if (jejak.has(id)) return 0;
      jejak.add(id);
      return (langsung.get(id) ?? 0) + (anak.get(id) ?? []).reduce((a, c) => a + total(c, jejak), 0);
    };
    const jabatan = await q(`SELECT j.*, o.nama unit_nama, a.nama atasan_nama,
        (SELECT COUNT(*) FROM users u WHERE u.jabatan_id=j.id AND u.aktif=1) pemegang
      FROM jabatan j LEFT JOIN unit_organisasi o ON o.id=j.unit_id LEFT JOIN jabatan a ON a.id=j.atasan_jabatan_id ORDER BY o.nama, j.nama`);
    const pemegang = await q('SELECT id, nama, jabatan_id FROM users WHERE aktif=1 AND jabatan_id IS NOT NULL ORDER BY nama');
    return {
      unit: unit.map((o) => ({ id: o.id, nama: o.nama, kode: o.kode, tingkat: o.tingkat, indukId: o.induk_id, indukNama: o.induk_nama ?? '',
        subUnit: Number(o.sub), karyawanLangsung: Number(o.langsung), totalKaryawan: total(o.id), jumlahJabatan: Number(o.jml_jabatan) })),
      jabatan: jabatan.map((j) => ({ id: j.id, nama: j.nama, unitId: j.unit_id, unitNama: j.unit_nama ?? '', atasanJabatanId: j.atasan_jabatan_id,
        atasanNama: j.atasan_nama ?? '', jenis: j.jenis, keterangan: j.keterangan, pemegang: Number(j.pemegang),
        namaPemegang: pemegang.filter((p) => p.jabatan_id === j.id).map((p) => p.nama) })),
    };
  },

  async org_unit_simpan(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), nama = s(m, 'nama'), kode = s(m, 'kode').slice(0, 20), tingkat = s(m, 'tingkat', 'divisi');
    const induk = i(m, 'indukId') || null;
    if (!nama) gagal('Nama unit wajib diisi');
    if (!TINGKAT.includes(tingkat)) gagal('Tingkat tidak sah');
    if (induk && !(await q1('SELECT id FROM unit_organisasi WHERE id=?', [induk]))) gagal('Unit induk tidak ditemukan');
    if (id) await cekLingkar('unit_organisasi', 'induk_id', id, induk);
    if (await q1('SELECT id FROM unit_organisasi WHERE LOWER(nama)=LOWER(?) AND induk_id <=> ? AND id<>?', [nama, induk, id]))
      gagal('Sudah ada unit dengan nama yang sama di bawah induk ini');
    await transaksi(async () => {
      if (id) {
        await exec('UPDATE unit_organisasi SET nama=?, kode=?, tingkat=?, induk_id=? WHERE id=?', [nama.slice(0, 120), kode, tingkat, induk, id]);
        await exec('UPDATE users SET dept=? WHERE unit_id=?', [nama.slice(0, 120), id]);
      } else await exec('INSERT INTO unit_organisasi (nama,kode,tingkat,induk_id) VALUES (?,?,?,?)', [nama.slice(0, 120), kode, tingkat, induk]);
    });
    await logAksi(u.id, id ? 'ubah_unit' : 'tambah_unit', nama);
    return { pesan: 'Unit organisasi tersimpan' };
  },
  async org_unit_hapus(m) {
    const u = await need(['admin']);
    const id = i(m, 'id');
    const o = await q1('SELECT * FROM unit_organisasi WHERE id=?', [id]);
    if (!o) gagal('Unit tidak ditemukan');
    const sub = Number(await nilai('SELECT COUNT(*) FROM unit_organisasi WHERE induk_id=?', [id]));
    if (sub) gagal(`Masih ada ${sub} sub unit di bawahnya. Pindahkan atau hapus sub unit dulu.`);
    const kar = Number(await nilai('SELECT COUNT(*) FROM users WHERE unit_id=?', [id]));
    if (kar) gagal(`Masih ada ${kar} karyawan di unit ini. Pindahkan dulu lewat menu Karyawan.`);
    await exec('DELETE FROM unit_organisasi WHERE id=?', [id]);
    await logAksi(u.id, 'hapus_unit', o.nama);
    return { pesan: 'Unit organisasi dihapus' };
  },

  async org_jabatan_simpan(m) {
    const u = await need(['admin']);
    const id = i(m, 'id'), nama = s(m, 'nama'), jenis = s(m, 'jenis', 'staf');
    const unit = i(m, 'unitId') || null, atasan = i(m, 'atasanJabatanId') || null;
    if (!nama) gagal('Nama jabatan wajib diisi');
    if (!JENIS_JABATAN.includes(jenis)) gagal('Jenis jabatan tidak sah');
    if (unit && !(await q1('SELECT id FROM unit_organisasi WHERE id=?', [unit]))) gagal('Unit organisasi tidak ditemukan');
    if (atasan && !(await q1('SELECT id FROM jabatan WHERE id=?', [atasan]))) gagal('Jabatan atasan tidak ditemukan');
    if (id) await cekLingkar('jabatan', 'atasan_jabatan_id', id, atasan);
    if (await q1('SELECT id FROM jabatan WHERE LOWER(nama)=LOWER(?) AND unit_id <=> ? AND id<>?', [nama, unit, id]))
      gagal('Jabatan dengan nama yang sama sudah ada di unit ini');
    const data = [nama.slice(0, 120), unit, atasan, jenis, s(m, 'keterangan').slice(0, 255)];
    await transaksi(async () => {
      if (id) {
        await exec('UPDATE jabatan SET nama=?, unit_id=?, atasan_jabatan_id=?, jenis=?, keterangan=? WHERE id=?', [...data, id]);
        await exec('UPDATE users SET jabatan=? WHERE jabatan_id=?', [nama.slice(0, 120), id]);
      } else await exec('INSERT INTO jabatan (nama,unit_id,atasan_jabatan_id,jenis,keterangan) VALUES (?,?,?,?,?)', data);
    });
    await logAksi(u.id, id ? 'ubah_jabatan' : 'tambah_jabatan', nama);
    return { pesan: 'Jabatan tersimpan' };
  },
  async org_jabatan_hapus(m) {
    const u = await need(['admin']);
    const id = i(m, 'id');
    const j = await q1('SELECT * FROM jabatan WHERE id=?', [id]);
    if (!j) gagal('Jabatan tidak ditemukan');
    const n = Number(await nilai('SELECT COUNT(*) FROM users WHERE jabatan_id=?', [id]));
    if (n) gagal(`Jabatan ini masih dipegang ${n} karyawan. Ganti jabatan mereka dulu.`);
    await exec('DELETE FROM jabatan WHERE id=?', [id]);
    await logAksi(u.id, 'hapus_jabatan', j.nama);
    return { pesan: 'Jabatan dihapus' };
  },
};
