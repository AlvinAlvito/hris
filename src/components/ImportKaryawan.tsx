'use client';
/* Impor data karyawan dari Excel: unduh template → isi → unggah → pratinjau per baris → simpan.
   File dibaca di browser (SheetJS); server memeriksa ulang setiap baris. */
import { useState } from 'react';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { pad, todayStr } from '@/lib/klien/format';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';

type Data = Record<string, any>;
// [kunci, judul kolom, wajib, contoh, keterangan]
const KOLOM: [string, string, boolean, string, string][] = [
  ['nik', 'NIK', true, 'CONTOH-001', 'Dipakai untuk login. NIK yang sudah terdaftar akan diperbarui datanya.'],
  ['nama', 'Nama Lengkap', true, 'Siti Rahmawati', 'Wajib untuk karyawan baru.'],
  ['jabatan', 'Jabatan', false, 'Staf Akademik', ''], ['dept', 'Divisi', false, 'Akademik', ''],
  ['noHp', 'No HP', false, '081234567890', 'Format kolom sebagai Teks agar angka 0 di depan tidak hilang.'],
  ['alamat', 'Alamat', false, 'Jl. Merdeka No. 10, Medan', ''], ['email', 'Email', false, 'siti@contoh.id', ''],
  ['lokasi', 'Lokasi Kerja', false, '', 'Tulis persis seperti di menu Lokasi Kerja. Kosong = kantor pusat.'],
  ['tglMasuk', 'Tanggal Masuk', false, '2025-01-06', 'YYYY-MM-DD atau DD/MM/YYYY. Kosong = hari ini (karyawan baru).'],
  ['statusKerja', 'Status Kerja', false, 'tetap', 'tetap / kontrak / probation / magang / harian / freelance'],
  ['kontrakMulai', 'Kontrak Mulai', false, '', 'Tanggal, untuk status kontrak'], ['kontrakSelesai', 'Kontrak Selesai', false, '', 'Tanggal, untuk status kontrak'],
  ['jk', 'Jenis Kelamin', false, 'P', 'L / P'], ['tempatLahir', 'Tempat Lahir', false, 'Medan', ''], ['tglLahir', 'Tanggal Lahir', false, '1998-04-12', 'Tanggal'],
  ['agama', 'Agama', false, 'Islam', ''], ['statusNikah', 'Status Nikah', false, 'lajang', 'lajang / menikah / cerai'],
  ['noKtp', 'No KTP', false, '', 'Format kolom sebagai Teks (16 digit).'], ['npwp', 'NPWP', false, '', ''],
  ['pendidikan', 'Pendidikan', false, 'S1', ''], ['jurusan', 'Jurusan', false, 'Pendidikan Matematika', ''],
  ['bankNama', 'Nama Bank', false, '', ''], ['bankRekening', 'No Rekening', false, '', 'Format kolom sebagai Teks.'],
  ['bankAtasNama', 'Atas Nama Rekening', false, '', ''], ['bpjsKesNo', 'No BPJS Kesehatan', false, '', 'Format kolom sebagai Teks.'],
  ['bpjsTkNo', 'No BPJS Ketenagakerjaan', false, '', 'Format kolom sebagai Teks.'], ['peran', 'Peran', false, 'Pegawai', 'Pegawai / HC. Kosong = Pegawai.'],
  ['pin', 'PIN', false, '', '4–8 digit angka. Kosong untuk karyawan baru = dibuat acak oleh sistem.'],
];
const KOLOM_TANGGAL = ['tglMasuk', 'kontrakMulai', 'kontrakSelesai', 'tglLahir'];
const KOLOM_TEKS = ['nik', 'noHp', 'noKtp', 'npwp', 'bankRekening', 'bpjsKesNo', 'bpjsTkNo', 'pin'];
const judulKolom = (k: string) => KOLOM.find((c) => c[0] === k)?.[1] ?? k;
const normalJudul = (s: unknown) => String(s).toLowerCase().replace(/\*/g, '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
/* pesan dari server memakai nama kunci; ganti dengan judul kolom Excel */
const pesanImport = (p: string) => KOLOM.reduce((x, k) => x.split(k[0] + ' ').join(k[1] + ' ').split(' ' + k[0]).join(' ' + k[1]), p);

function nilaiSel(v: unknown, kunci: string): string {
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 12 * 3600000);   // hindari tanggal mundur sehari karena pembulatan zona waktu
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  const s = String(v ?? '').trim();
  if (KOLOM_TANGGAL.includes(kunci)) { const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/); if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`; }
  if (kunci === 'noHp' && /^8\d{7,}$/.test(s)) return '0' + s;     // angka 0 di depan hilang karena sel bertipe angka
  if (kunci === 'jk') { const h = s.charAt(0).toUpperCase(); return h === 'L' || h === 'P' ? h : s; }
  if (kunci === 'statusKerja' || kunci === 'statusNikah') return s.toLowerCase();
  return s;
}

export function ImportKaryawan({ selesai }: { selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [baris, setBaris] = useState<Data[]>([]);
  const [hasil, setHasil] = useState<Data[] | null>(null);
  const [salah, setSalah] = useState('');
  const [proses, setProses] = useState(false);
  const [beres, setBeres] = useState(false);

  const unduhTemplate = async () => {
    try {
      const [XLSX, cab] = await Promise.all([import('xlsx'), api<Data[]>('adm_cabang', {}, true)]);
      const pusat = (cab.find((c) => c.tipe === 'pusat') ?? cab[0])?.nama ?? '';
      const ws = XLSX.utils.aoa_to_sheet([KOLOM.map((k) => k[1] + (k[2] ? ' *' : '')), KOLOM.map((k) => (k[0] === 'lokasi' ? pusat : k[3]))]);
      ws['!cols'] = KOLOM.map((k) => ({ wch: Math.max(14, k[1].length + 4) }));
      const pet: unknown[][] = [['Kolom', 'Wajib', 'Keterangan'], ...KOLOM.map((k) => [k[1], k[2] ? 'Ya' : '', k[4]]), [],
        ['Lokasi kerja yang tersedia', '', cab.map((c) => c.nama).join(', ') || '-'], ['Baris contoh (NIK berawalan CONTOH) otomatis dilewati saat impor.']];
      const wp = XLSX.utils.aoa_to_sheet(pet); wp['!cols'] = [{ wch: 26 }, { wch: 8 }, { wch: 84 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data Karyawan'); XLSX.utils.book_append_sheet(wb, wp, 'Petunjuk');
      XLSX.writeFile(wb, 'template-import-karyawan.xlsx');
    } catch (e) { galat(e); }
  };

  const periksa = async (file?: File) => {
    if (!file) return;
    setSalah(''); setHasil(null); setBeres(false); setProses(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets['Data Karyawan'] ?? wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
      const iJudul = rows.findIndex((r) => r.some((c) => normalJudul(c) === 'nik'));
      if (iJudul < 0) throw new Error('Kolom "NIK" tidak ditemukan. Gunakan template dari tombol Template Excel.');
      const kolom = rows[iJudul].map((c) => KOLOM.find((x) => normalJudul(x[1]) === normalJudul(c))?.[0] ?? null);
      const data: Data[] = [];
      rows.slice(iJudul + 1).forEach((r, i) => {
        if (!r.some((c) => String(c).trim() !== '')) return;
        const o: Data = { _baris: iJudul + i + 2 }, catatan: string[] = [];
        kolom.forEach((k, j) => {
          if (!k) return;
          const v = r[j];
          // angka panjang (KTP/rekening) yang tersimpan sebagai angka sudah kehilangan digit terakhirnya
          if (typeof v === 'number' && KOLOM_TEKS.includes(k) && String(Math.round(v)).length > 15) catatan.push(judulKolom(k) + ' terbaca sebagai angka; ubah format kolomnya menjadi Teks');
          o[k] = nilaiSel(v, k);
        });
        if (/^contoh/i.test(o.nik || '')) return;
        o._catatan = catatan;
        data.push(o);
      });
      if (!data.length) throw new Error('Tidak ada baris data di file (baris contoh dilewati).');
      setBaris(data);
      const d = await api<{ hasil: Data[] }>('kr_import', { baris: data, simpan: 0 });
      setHasil(d.hasil.map((h) => {
        const b = data.find((x) => x._baris === h.baris);
        return b?._catatan.length ? { ...h, aksi: 'gagal', pesan: [h.pesan, ...b._catatan].filter(Boolean).join('; ') } : h;
      }));
    } catch (e) { setSalah(e instanceof Error ? e.message : 'File tidak bisa dibaca'); }
    setProses(false);
  };
  const simpan = async () => {
    setProses(true);
    try {
      const sah = baris.filter((x) => hasil?.find((y) => y.baris === x._baris)?.aksi !== 'gagal');
      const d = await api<{ hasil: Data[] }>('kr_import', { baris: sah, simpan: 1 });
      setHasil([...d.hasil, ...(hasil ?? []).filter((x) => x.aksi === 'gagal')].sort((a, b) => a.baris - b.baris));
      setBeres(true); toast('Import selesai'); selesai();
    } catch (e) { galat(e); }
    setProses(false);
  };

  const n = (a: string) => (hasil ?? []).filter((x) => x.aksi === a).length, valid = n('baru') + n('perbarui');
  const warna: Data = { baru: 'b-green', perbarui: 'b-blue', gagal: 'b-red' };
  const label: Data = { baru: beres ? 'Ditambahkan' : 'Baru', perbarui: beres ? 'Diperbarui' : 'Perbarui', gagal: beres ? 'Dilewati' : 'Gagal' };
  const pinBaru = (hasil ?? []).filter((x) => x.pin);
  return (<>
    <h3><Ikon n="upload" />Import Data Karyawan</h3>
    <div className="imp-langkah"><span className="no">1</span><div style={{ flex: 1 }}><b>Unduh template</b>
      <div className="tiny muted">Isi satu baris per karyawan. Kolom bertanda * wajib.</div></div>
      <button className="btn ghost sm auto" onClick={unduhTemplate}><Ikon n="download" />Template Excel</button></div>
    <div className="imp-langkah"><span className="no">2</span><div style={{ flex: 1, minWidth: 0 }}><b>Unggah file yang sudah diisi</b>
      <div className="tiny muted">.xlsx, .xls, atau .csv — NIK yang sudah terdaftar akan diperbarui.</div>
      <input type="file" accept=".xlsx,.xls,.csv" style={{ marginTop: 8 }} onChange={(e) => periksa(e.target.files?.[0])} /></div></div>
    {salah && <div className="err" style={{ marginTop: 14 }}>{salah}</div>}
    {proses && !hasil && <div className="skel" style={{ height: 90, marginTop: 14 }} />}
    {hasil && (<>
      {beres && <div className="note" style={{ marginTop: 14 }}><Ikon n="circle-check" /> <b>{valid} data tersimpan.</b>
        {pinBaru.length > 0 && ` ${pinBaru.length} karyawan baru mendapat PIN acak — unduh daftarnya dan bagikan ke masing-masing.`}</div>}
      <div className="imp-ringkas">{['baru', 'perbarui', 'gagal'].map((a) => <span key={a} className={'badge ' + warna[a]}>{n(a)} {label[a].toLowerCase()}</span>)}</div>
      <div className="tblwrap" style={{ maxHeight: '46vh' }}><table style={{ minWidth: 560 }}><thead><tr><th>Baris</th><th>NIK</th><th>Nama</th><th>Status</th>
        {beres && pinBaru.length > 0 && <th>PIN</th>}<th>Keterangan</th></tr></thead><tbody>
        {hasil.map((x) => (<tr key={x.baris}><td className="num">{x.baris}</td><td>{x.nik || '-'}</td><td>{x.nama || '-'}</td>
          <td><span className={'badge ' + warna[x.aksi]}>{label[x.aksi]}</span></td>
          {beres && pinBaru.length > 0 && <td className="num"><b>{x.pin}</b></td>}
          <td className="tiny" style={{ whiteSpace: 'normal', minWidth: 220, color: x.aksi === 'gagal' ? 'var(--danger)' : 'var(--muted)' }}>{pesanImport(x.pesan || '')}</td></tr>))}
      </tbody></table></div>
      {beres ? (
        <div className="row" style={{ marginTop: 14 }}>
          {pinBaru.length > 0 && <button className="btn ghost" onClick={() => keExcel(pinBaru.map((x) => ({ NIK: x.nik, Nama: x.nama, PIN: x.pin })), 'PIN', 'pin-karyawan-baru-' + todayStr()).catch(galat)}><Ikon n="download" />Daftar PIN</button>}
          <button className="btn" onClick={tutupSheet}>Selesai</button></div>
      ) : (<>
        <button className="btn" disabled={!valid || proses} onClick={simpan}><Ikon n="check" />{valid ? `Simpan ${valid} data` : 'Tidak ada data yang bisa disimpan'}</button>
        {n('gagal') > 0 && <div className="tiny muted center" style={{ marginTop: 6 }}>Baris yang gagal dilewati. Perbaiki di Excel lalu unggah ulang bila perlu.</div>}
      </>)}
    </>)}
  </>);
}
