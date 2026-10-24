'use client';
/* Dokumen privat karyawan: daftar, lihat, unggah, hapus */
import { useState } from 'react';
import { api } from '@/lib/klien/api';
import { bacaBerkas } from '@/lib/klien/berkas';
import { tglPendek, todayStr } from '@/lib/klien/format';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';

type Data = Record<string, any>;

export function useLihatBerkas() {
  const { bukaSheet } = useAplikasi();
  return (b: Data) => {
    if (b.mime === 'application/pdf') { window.open(b.url, '_blank', 'noopener'); return; }
    bukaSheet(<>
      <h3><Ikon n="image" />{b.nama || b.jenis}</h3>
      <img src={b.url} alt="" style={{ width: '100%', borderRadius: 14, marginTop: 8 }} />
      <a className="btn ghost" href={b.url + '&unduh=1'}><Ikon n="download" />Unduh</a>
    </>, { besar: true });
  };
}
export function ChipBerkas({ list }: { list?: Data[] }) {
  const lihat = useLihatBerkas();
  return <>{(list ?? []).map((b) => (
    <button key={b.id} className="btn ghost sm auto" style={{ margin: '6px 6px 0 0' }} onClick={() => lihat(b)}>
      <Ikon n={b.mime === 'application/pdf' ? 'file-text' : 'image'} />{b.jenis || b.nama}</button>))}</>;
}

export function DaftarDokumen({ list, userId, jenis, segarkan }: { list: Data[]; userId: number; jenis: string[]; segarkan: () => void }) {
  const { bukaSheet, tutupSheet, yakin, toast, galat } = useAplikasi();
  const lihat = useLihatBerkas();
  const hapus = async (id: number) => {
    if (!(await yakin('Hapus dokumen ini?', 'Berkas akan dihapus permanen dari server.'))) return;
    api<{ pesan: string }>('dok_hapus', { id }).then((r) => { toast(r.pesan); segarkan(); }).catch(galat);
  };
  const unggah = () => {
    function Form() {
      const [j, setJ] = useState(jenis[0]), [file, setFile] = useState<File>(), [berlaku, setBerlaku] = useState(''), [kirim, setKirim] = useState(false);
      const simpan = async () => {
        if (!file) { toast('Pilih berkas dulu', true); return; }
        setKirim(true);
        try {
          const b = await bacaBerkas(file, 2000);
          const r = await api<{ pesan: string }>('dok_unggah', { userId, jenis: j, nama: b.nama, data: b.data, berlakuSampai: berlaku });
          tutupSheet(); toast(r.pesan); segarkan();
        } catch (e) { galat(e); setKirim(false); }
      };
      return (<>
        <h3><Ikon n="upload" />Unggah Dokumen</h3>
        <label>Jenis dokumen</label><select value={j} onChange={(e) => setJ(e.target.value)}>{jenis.map((x) => <option key={x}>{x}</option>)}</select>
        <label>Berkas (foto atau PDF, maks 5 MB)</label><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0])} />
        <label>Berlaku sampai <span className="tiny">(opsional, mis. kontrak / sertifikat)</span></label>
        <input type="date" value={berlaku} onChange={(e) => setBerlaku(e.target.value)} />
        <button className="btn" disabled={kirim} onClick={simpan}><Ikon n="upload" />Unggah</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  return (<>
    {list.length ? list.map((b) => {
      const kedaluwarsa = b.berlakuSampai && b.berlakuSampai < todayStr();
      return (
        <div key={b.id} className="item"><div className="top">
          <div className="orang"><span className="aj-ic"><Ikon n={b.mime === 'application/pdf' ? 'file-text' : 'image'} /></span>
            <div><b>{b.jenis}</b><div className="tiny muted">{b.nama} · {Math.max(1, Math.round(b.ukuran / 1024))} KB · {tglPendek(b.tanggal)}</div>
              {b.berlakuSampai && <div className="tiny" style={{ color: kedaluwarsa ? 'var(--danger)' : 'var(--muted)' }}>berlaku s.d. {tglPendek(b.berlakuSampai)}{kedaluwarsa && ' — kedaluwarsa'}</div>}
            </div></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost sm auto" title="Lihat" onClick={() => lihat(b)}><Ikon n="eye" /></button>
            <button className="btn ghost sm auto" title="Hapus" onClick={() => hapus(b.id)}><Ikon n="trash-2" /></button>
          </div></div></div>);
    }) : <div className="empty"><Ikon n="file-text" />Belum ada dokumen.</div>}
    <button className="btn soft" onClick={unggah}><Ikon n="upload" />Unggah Dokumen</button>
  </>);
}
