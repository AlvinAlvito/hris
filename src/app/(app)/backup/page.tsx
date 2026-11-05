'use client';
/* Status backup database ke Google Spreadsheet (HC / Super Admin) */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';

type Hasil = { name: string; rows: number; status: string };
type Data = { aktif: boolean; berjalan: boolean; selangJam: number; sheetUrl: string;
  status: { lastSuccessAt?: string; lastAttemptAt?: string; lastError?: string | null; durationMs?: number; sheets?: Hasil[]; selTerpotong?: number } };
const waktu = (t?: string) => (t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) + ' WIB' : '-');

export default function Backup() {
  const { toast, galat } = useAplikasi();
  const [d, setD] = useState<Data | null>(null);
  const muat = useCallback(() => { api<Data>('backup_status', {}, true).then(setD).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => {
    if (!d?.berjalan) return;
    const t = setInterval(muat, 5000);
    return () => clearInterval(t);
  }, [d?.berjalan, muat]);
  const mulai = () => api<{ pesan: string }>('backup_jalankan', {}).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  if (!d) return <div className="skel" style={{ height: 160 }} />;
  const st = d.status, hasil = st.sheets ?? [], ditahan = hasil.filter((x) => x.status !== 'OK');
  const total = hasil.reduce((a, x) => a + x.rows, 0);
  return (<>
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="shield-check" />Backup ke Google Spreadsheet</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {d.sheetUrl && <a className="btn ghost sm auto" href={d.sheetUrl} target="_blank" rel="noreferrer"><Ikon n="external-link" />Buka Spreadsheet</a>}
          {d.aktif && <button className="btn sm auto" disabled={d.berjalan} onClick={mulai}><Ikon n="shield-check" />{d.berjalan ? 'Sedang berjalan…' : 'Backup sekarang'}</button>}</div></div>
      {!d.aktif ? <div className="warn" style={{ marginTop: 12 }}>Backup belum dikonfigurasi di server.</div>
        : st.lastError ? <div className="warn" style={{ marginTop: 12 }}><b>Percobaan terakhir gagal:</b> {st.lastError}</div>
          : ditahan.length > 0 && <div className="warn" style={{ marginTop: 12 }}><b>{ditahan.length} sheet ditahan</b> karena jumlah barisnya turun lebih dari separuh. Isi lama di spreadsheet tetap aman. Periksa database sebelum menimpanya.</div>}
      <div className="statgrid g3">
        <div className="stat"><div className="k">Backup terakhir</div><div className="v" style={{ fontSize: 16 }}>{waktu(st.lastSuccessAt)}</div></div>
        <div className="stat"><div className="k">Jadwal</div><div className="v" style={{ fontSize: 16 }}>Tiap {d.selangJam} jam</div></div>
        <div className="stat"><div className="k">Isi terakhir</div><div className="v" style={{ fontSize: 16 }}>{hasil.length} tabel · {total.toLocaleString('id-ID')} baris</div></div></div>
      {!!st.selTerpotong && <div className="note" style={{ marginTop: 12 }}>{st.selTerpotong} isi sel terpotong karena melebihi batas 50.000 karakter per sel Google Sheets.</div>}
      <div className="tiny muted" style={{ marginTop: 12 }}>Tidak ikut dikirim: hash PIN, kunci rahasia, dan langganan notifikasi. Berkas unggahan (foto absen, dokumen, CV) tidak tersalin, hanya nama berkasnya.</div>
    </div>
    {hasil.length > 0 && <div className="card"><h3><Ikon n="list-checks" />Hasil per Tabel</h3>
      <div className="tblwrap"><table><thead><tr><th>Tabel</th><th className="r">Baris</th><th>Status</th></tr></thead><tbody>
        {hasil.map((x) => <tr key={x.name}><td>{x.name}</td><td className="r">{x.rows.toLocaleString('id-ID')}</td>
          <td><span className={'badge ' + (x.status === 'OK' ? 'b-green' : 'b-red')}>{x.status}</span></td></tr>)}
      </tbody></table></div></div>}
  </>);
}
