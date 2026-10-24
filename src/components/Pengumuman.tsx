'use client';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { tglIndo, tglPendek } from '@/lib/klien/format';

type Data = Record<string, any>;

/* Satu pengumuman di daftar, dan sheet untuk membacanya (sekaligus menandai sudah dibaca) */
export function ItemPengumuman({ p, buka }: { p: Data; buka: () => void }) {
  return (
    <div className={'pg-item' + (p.penting ? ' penting' : '') + (p.dibaca ? '' : ' baru')} onClick={buka}>
      <div className="ic"><Ikon n={p.penting ? 'circle-alert' : 'megaphone'} /></div>
      <div style={{ minWidth: 0, flex: 1 }}><div className="jd">{p.judul}</div><div className="ringkas">{p.isi}</div>
        <div className="tiny muted" style={{ marginTop: 3 }}>{tglPendek(p.mulai)}{p.oleh && ' · ' + p.oleh}{p.cabang && ' · ' + p.cabang}</div></div>
    </div>
  );
}
export function useBukaPengumuman(setInfo: (f: (x: Data | null) => Data | null) => void) {
  const { bukaSheet, tutupSheet } = useAplikasi();
  return (p: Data) => {
    bukaSheet(<>
      <h3><Ikon n={p.penting ? 'circle-alert' : 'megaphone'} />{p.judul}</h3>
      <div className="tiny muted">{tglIndo(p.mulai)}{p.oleh && ' · oleh ' + p.oleh}{p.sampai && ' · berlaku s.d. ' + tglPendek(p.sampai)}</div>
      <div style={{ whiteSpace: 'pre-wrap', marginTop: 14, lineHeight: 1.7 }}>{p.isi}</div>
      <button className="btn" onClick={tutupSheet}>Tutup</button>
    </>);
    if (!p.dibaca) {
      api('info_baca', { id: p.id }, true).catch(() => {});
      setInfo((x) => x && { ...x, belumDibaca: Math.max(0, x.belumDibaca - 1), pengumuman: x.pengumuman.map((y: Data) => (y.id === p.id ? { ...y, dibaca: true } : y)) });
    }
  };
}
