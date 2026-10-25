'use client';
/* Master struktur organisasi (HC / Super Admin): unit organisasi bertingkat dan jabatan, lengkap dengan tambah / ubah / hapus */
import { useMemo, useState } from 'react';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';

type Data = Record<string, any>;
export interface DataOrganisasi { unit: Data[]; jabatan: Data[] }

const TINGKAT: [string, string][] = [['direksi', 'Direksi'], ['divisi', 'Divisi'], ['departemen', 'Departemen'], ['unit', 'Unit']];
const NAMA_TINGKAT = Object.fromEntries(TINGKAT);
const JENIS: [string, string][] = [['struktural', 'Struktural'], ['fungsional', 'Fungsional'], ['staf', 'Staf']];
const NAMA_JENIS = Object.fromEntries(JENIS);

/* urutkan unit menjadi pohon (induk lalu anak-anaknya) beserta kedalamannya */
function urutPohon(unit: Data[]): (Data & { dalam: number })[] {
  const anak = new Map<number | null, Data[]>();
  const ada = new Set(unit.map((u) => u.id));
  for (const u of unit) { const k = u.indukId && ada.has(u.indukId) ? u.indukId : null; if (!anak.has(k)) anak.set(k, []); anak.get(k)!.push(u); }
  const urut = TINGKAT.map(([k]) => k);
  for (const l of anak.values()) l.sort((a, b) => urut.indexOf(a.tingkat) - urut.indexOf(b.tingkat) || a.nama.localeCompare(b.nama, 'id'));
  const hasil: (Data & { dalam: number })[] = [], jejak = new Set<number>();
  const jalan = (k: number | null, dalam: number) => {
    for (const u of anak.get(k) ?? []) { if (jejak.has(u.id)) continue; jejak.add(u.id); hasil.push({ ...u, dalam }); jalan(u.id, dalam + 1); }
  };
  jalan(null, 0);
  return hasil;
}

export function DaftarUnit({ data, muat }: { data: DataOrganisasi; muat: () => void }) {
  const { bukaSheet, yakin, toast, galat } = useAplikasi();
  const [cari, setCari] = useState(''), [tingkat, setTingkat] = useState('');
  const pohon = useMemo(() => urutPohon(data.unit), [data.unit]);
  const q = cari.trim().toLocaleLowerCase('id');
  const tampil = pohon.filter((u) => (!tingkat || u.tingkat === tingkat) && (!q || `${u.nama} ${u.kode} ${u.indukNama}`.toLocaleLowerCase('id').includes(q)));
  const datar = !!q || !!tingkat;
  const form = (u: Data | null, induk?: number) => bukaSheet(<FormUnit u={u} indukAwal={induk} unit={data.unit} selesai={muat} />);
  const hapus = async (u: Data) => {
    if (!(await yakin(`Hapus unit "${u.nama}"?`, 'Unit yang masih punya sub unit atau karyawan tidak dapat dihapus.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('org_unit_hapus', { id: u.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  const ekspor = () => keExcel(pohon.map((u) => ({ 'Unit Organisasi': u.nama, Kode: u.kode, Tingkat: NAMA_TINGKAT[u.tingkat], 'Berinduk Pada': u.indukNama,
    'Sub Unit': u.subUnit, 'Karyawan Langsung': u.karyawanLangsung, 'Total Karyawan': u.totalKaryawan, 'Jumlah Jabatan': u.jumlahJabatan })),
  'Unit Organisasi', 'unit-organisasi').catch(galat);
  return (
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}>
        <div><h3 style={{ margin: 0 }}><Ikon n="git-branch" />Unit Organisasi</h3>
          <div className="tiny muted">{data.unit.length} unit · hierarki Direksi › Divisi › Departemen › Unit · total karyawan termasuk seluruh unit di bawahnya</div></div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Excel</button>
          <button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Unit Organisasi</button></div>
      </div>
      <div className="lap-filter" style={{ marginTop: 10 }}>
        <div><label style={{ marginTop: 0 }}>Cari</label><input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari unit organisasi…" /></div>
        <div><label style={{ marginTop: 0 }}>Tingkat</label><select value={tingkat} onChange={(e) => setTingkat(e.target.value)}>
          <option value="">Semua tingkat</option>{TINGKAT.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      </div>
      {!data.unit.length ? <div className="empty">Belum ada unit organisasi. Tambahkan Direksi lebih dulu, lalu divisi di bawahnya.</div>
        : !tampil.length ? <div className="empty">Tidak ada unit yang cocok.</div> : (
          <div className="tblwrap"><table><thead><tr><th>Unit Organisasi</th><th>Tingkat</th><th>Berinduk Pada</th><th className="num">Sub Unit</th>
            <th className="num">Karyawan Langsung</th><th className="num">Total Karyawan</th><th /></tr></thead><tbody>
            {tampil.map((u) => (
              <tr key={u.id}>
                <td><span className="org-indent" style={{ paddingLeft: datar ? 0 : u.dalam * 20 }}>{!datar && u.dalam > 0 && <span className="cab">└</span>}
                  <span><b>{u.nama}</b>{u.kode && <div className="tiny muted">{u.kode}</div>}</span></span></td>
                <td><span className={'badge t-' + u.tingkat}>{NAMA_TINGKAT[u.tingkat]}</span></td>
                <td>{u.indukNama || '—'}</td><td className="num">{u.subUnit}</td><td className="num">{u.karyawanLangsung}</td><td className="num"><b>{u.totalKaryawan}</b></td>
                <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                  {u.tingkat !== 'unit' && <button className="btn ghost sm auto" title="Tambah sub unit" aria-label={'Tambah sub unit di ' + u.nama} onClick={() => form(null, u.id)}><Ikon n="plus" /></button>}
                  <button className="btn ghost sm auto" onClick={() => form(u)}>Ubah</button>
                  <button className="btn red sm auto" onClick={() => hapus(u)}>Hapus</button></div></td>
              </tr>))}
          </tbody></table></div>)}
    </div>
  );
}

function FormUnit({ u, indukAwal, unit, selesai }: { u: Data | null; indukAwal?: number; unit: Data[]; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const induk0 = unit.find((x) => x.id === indukAwal);
  const tingkatAnak: Record<string, string> = { direksi: 'divisi', divisi: 'departemen', departemen: 'unit', unit: 'unit' };
  const [v, setV] = useState<Data>({ nama: u?.nama ?? '', kode: u?.kode ?? '', tingkat: u?.tingkat ?? (induk0 ? tingkatAnak[induk0.tingkat] : 'divisi'),
    indukId: u?.indukId ?? indukAwal ?? 0 });
  const [kirim, setKirim] = useState(false);
  // calon induk: bukan diri sendiri dan bukan turunannya
  const turunan = useMemo(() => {
    const t = new Set<number>(); if (!u) return t;
    const jalan = (id: number) => unit.filter((x) => x.indukId === id).forEach((x) => { if (!t.has(x.id)) { t.add(x.id); jalan(x.id); } });
    jalan(u.id); return t;
  }, [u, unit]);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const simpan = () => {
    setKirim(true);
    api<{ pesan: string }>('org_unit_simpan', { ...v, id: u?.id ?? 0, indukId: +v.indukId }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); })
      .catch((e) => { galat(e); setKirim(false); });
  };
  return (<>
    <h3>{u ? 'Ubah Unit Organisasi' : 'Tambah Unit Organisasi'}</h3>
    <label>Nama unit</label><input value={v.nama} onChange={set('nama')} placeholder="mis. Divisi Akademik" autoFocus />
    <div className="row">
      <div><label>Tingkat</label><select value={v.tingkat} onChange={set('tingkat')}>{TINGKAT.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div><label>Kode <span className="tiny muted">(opsional)</span></label><input value={v.kode} onChange={set('kode')} placeholder="mis. 005" /></div>
    </div>
    <label>Berinduk pada</label>
    <select value={v.indukId} onChange={set('indukId')}><option value={0}>— Tidak ada (paling atas) —</option>
      {urutPohon(unit).filter((x) => x.id !== u?.id && !turunan.has(x.id)).map((x) => <option key={x.id} value={x.id}>{'  '.repeat(x.dalam)}{x.nama} · {NAMA_TINGKAT[x.tingkat]}</option>)}</select>
    {u && <div className="tiny muted" style={{ marginTop: 6 }}>Mengganti nama juga memperbarui kolom divisi para karyawan di unit ini.</div>}
    <button className="btn" disabled={kirim || !v.nama.trim()} onClick={simpan}><Ikon n="check" />Simpan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

export function DaftarJabatan({ data, muat }: { data: DataOrganisasi; muat: () => void }) {
  const { bukaSheet, yakin, toast, galat } = useAplikasi();
  const [cari, setCari] = useState(''), [unit, setUnit] = useState(0);
  const q = cari.trim().toLocaleLowerCase('id');
  const tampil = data.jabatan.filter((j) => (!unit || j.unitId === unit) && (!q || `${j.nama} ${j.unitNama} ${j.atasanNama} ${j.namaPemegang.join(' ')}`.toLocaleLowerCase('id').includes(q)));
  const form = (j: Data | null) => bukaSheet(<FormJabatan j={j} data={data} selesai={muat} />);
  const hapus = async (j: Data) => {
    if (!(await yakin(`Hapus jabatan "${j.nama}"?`, 'Jabatan yang masih dipegang karyawan tidak dapat dihapus.', { ya: 'Hapus' }))) return;
    api<{ pesan: string }>('org_jabatan_hapus', { id: j.id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  const ekspor = () => keExcel(data.jabatan.map((j) => ({ Jabatan: j.nama, Jenis: NAMA_JENIS[j.jenis], 'Unit Organisasi': j.unitNama, 'Melapor Ke': j.atasanNama,
    'Jumlah Pemegang': j.pemegang, Pemegang: j.namaPemegang.join(', '), Keterangan: j.keterangan })), 'Jabatan', 'jabatan').catch(galat);
  return (
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}>
        <div><h3 style={{ margin: 0 }}><Ikon n="briefcase" />Jabatan</h3>
          <div className="tiny muted">{data.jabatan.length} jabatan · dipilih di formulir karyawan; “melapor ke” membentuk jenjang jabatan</div></div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn ghost sm auto" onClick={ekspor}><Ikon n="download" />Excel</button>
          <button className="btn sm auto" onClick={() => form(null)}><Ikon n="plus" />Jabatan</button></div>
      </div>
      <div className="lap-filter" style={{ marginTop: 10 }}>
        <div><label style={{ marginTop: 0 }}>Cari</label><input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari jabatan / pemegang…" /></div>
        <div><label style={{ marginTop: 0 }}>Unit organisasi</label><select value={unit} onChange={(e) => setUnit(+e.target.value)}>
          <option value={0}>Semua unit</option>{urutPohon(data.unit).map((u) => <option key={u.id} value={u.id}>{'  '.repeat(u.dalam)}{u.nama}</option>)}</select></div>
      </div>
      {!data.jabatan.length ? <div className="empty">Belum ada jabatan.</div> : !tampil.length ? <div className="empty">Tidak ada jabatan yang cocok.</div> : (
        <div className="tblwrap"><table><thead><tr><th>Jabatan</th><th>Jenis</th><th>Unit Organisasi</th><th>Melapor Ke</th><th>Pemegang</th><th /></tr></thead><tbody>
          {tampil.map((j) => (
            <tr key={j.id}>
              <td><b>{j.nama}</b>{j.keterangan && <div className="tiny muted">{j.keterangan}</div>}</td>
              <td><span className={'badge ' + (j.jenis === 'struktural' ? 'b-blue' : j.jenis === 'fungsional' ? 'b-purple' : 'b-gray')}>{NAMA_JENIS[j.jenis]}</span></td>
              <td>{j.unitNama || '—'}</td><td>{j.atasanNama || '—'}</td>
              <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{j.pemegang ? <><b>{j.pemegang}</b> <span className="tiny muted">{j.namaPemegang.slice(0, 3).join(', ')}{j.pemegang > 3 && ` +${j.pemegang - 3}`}</span></>
                : <span className="badge b-amber">Kosong</span>}</td>
              <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                <button className="btn ghost sm auto" onClick={() => form(j)}>Ubah</button>
                <button className="btn red sm auto" onClick={() => hapus(j)}>Hapus</button></div></td>
            </tr>))}
        </tbody></table></div>)}
    </div>
  );
}

function FormJabatan({ j, data, selesai }: { j: Data | null; data: DataOrganisasi; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState<Data>({ nama: j?.nama ?? '', unitId: j?.unitId ?? 0, atasanJabatanId: j?.atasanJabatanId ?? 0, jenis: j?.jenis ?? 'staf', keterangan: j?.keterangan ?? '' });
  const [kirim, setKirim] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const simpan = () => {
    setKirim(true);
    api<{ pesan: string }>('org_jabatan_simpan', { ...v, id: j?.id ?? 0, unitId: +v.unitId, atasanJabatanId: +v.atasanJabatanId })
      .then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch((e) => { galat(e); setKirim(false); });
  };
  return (<>
    <h3>{j ? 'Ubah Jabatan' : 'Tambah Jabatan'}</h3>
    <label>Nama jabatan</label><input value={v.nama} onChange={set('nama')} placeholder="mis. Supervisor Sales" autoFocus />
    <div className="row">
      <div><label>Jenis</label><select value={v.jenis} onChange={set('jenis')}>{JENIS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div><label>Unit organisasi</label><select value={v.unitId} onChange={set('unitId')}><option value={0}>— Belum ditentukan —</option>
        {urutPohon(data.unit).map((u) => <option key={u.id} value={u.id}>{'  '.repeat(u.dalam)}{u.nama}</option>)}</select></div>
    </div>
    <label>Melapor ke (jabatan atasan)</label>
    <select value={v.atasanJabatanId} onChange={set('atasanJabatanId')}><option value={0}>— Tidak ada —</option>
      {data.jabatan.filter((x) => x.id !== j?.id).map((x) => <option key={x.id} value={x.id}>{x.nama}{x.unitNama && ` · ${x.unitNama}`}</option>)}</select>
    <label>Keterangan <span className="tiny muted">(opsional)</span></label><input value={v.keterangan} onChange={set('keterangan')} placeholder="mis. tanggung jawab utama" />
    {j && <div className="tiny muted" style={{ marginTop: 6 }}>Mengganti nama juga memperbarui kolom jabatan para pemegangnya.</div>}
    <button className="btn" disabled={kirim || !v.nama.trim()} onClick={simpan}><Ikon n="check" />Simpan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}
