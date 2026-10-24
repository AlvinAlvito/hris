'use client';
/* Sheet foto absen beserta koordinat & tautan peta — dipakai riwayat pegawai dan rekap HC */
import { km, tglIndo } from '@/lib/klien/format';
import { useAplikasi } from './Aplikasi';

type Data = Record<string, any>;
export function useLihatFoto() {
  const { me, bukaSheet, tutupSheet } = useAplikasi();
  return (a: Data, w: 'in' | 'out') => {
    const src = w === 'in' ? a.inPhoto : a.outPhoto, lat = w === 'in' ? a.inLat : a.outLat, lng = w === 'in' ? a.inLng : a.outLng;
    bukaSheet(<>
      <h3>Foto {w === 'in' ? 'Clock In' : 'Clock Out'}</h3>
      <div className="muted small">{a.nama || me?.nama} · {tglIndo(a.tanggal)} · {w === 'in' ? a.inTime : a.outTime}</div>
      <img src={src} alt="" style={{ width: '100%', borderRadius: 12, marginTop: 10 }} />
      {a.mode === 'lapangan' && <div className="kv" style={{ marginTop: 8 }}><span>Jarak dari titik awal</span><span><b>{km((w === 'in' ? a.inJarakBase : a.outJarakBase) || 0)}</b></span></div>}
      {lat != null && (<>
        <div className="kv"><span>Koordinat</span><span>{lat.toFixed(6)}, {lng.toFixed(6)}</span></div>
        <a className="btn ghost" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${lat},${lng}`}>Lihat di Google Maps</a>
      </>)}
      <button className="btn ghost" onClick={tutupSheet}>Tutup</button>
    </>);
  };
}
