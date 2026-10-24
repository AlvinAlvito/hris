'use client';
import { useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { NavigasiHalaman, type HalamanData } from '@/components/NavigasiHalaman';
import { useLihatFoto } from '@/components/FotoAbsen';
import { api } from '@/lib/klien/api';
import { jamKerjaTeks, km, NAMA_BULAN, tglIndo } from '@/lib/klien/format';

type Data = Record<string, any>;

export default function Riwayat() {
  const { galat } = useAplikasi();
  const kini = new Date();
  const [bulan, setBulan] = useState(kini.getMonth() + 1);
  const [tahun, setTahun] = useState(kini.getFullYear());
  const [list, setList] = useState<HalamanData<Data> | null>(null);
  const [cari, setCari] = useState(''), [page, setPage] = useState(1);
  const lihatFoto = useLihatFoto();
  useEffect(() => { setList(null); api<HalamanData<Data>>('riwayat', { bulan, tahun, search: cari, page }).then(setList).catch(galat); }, [bulan, tahun, cari, page, galat]);
  const rows = list?.items ?? [];

  return (
    <div className="sempit">
      <div className="card"><h3><Ikon n="history" />Riwayat Absensi</h3>
        <div className="row">
          <div><label style={{ marginTop: 0 }}>Bulan</label>
            <select value={bulan} onChange={(e) => { setBulan(+e.target.value); setPage(1); }}>{NAMA_BULAN.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></div>
          <div><label style={{ marginTop: 0 }}>Tahun</label>
            <select value={tahun} onChange={(e) => { setTahun(+e.target.value); setPage(1); }}>{[0, 1, 2, 3].map((x) => <option key={x}>{kini.getFullYear() - x}</option>)}</select></div>
        </div>
        <label>Cari tanggal, jam, atau shift</label><input value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} placeholder="Ketik tanggal / jam / shift" />
      </div>
      {!list ? <div className="card"><div className="skel" style={{ height: 80 }} /></div>
        : !rows.length ? <div className="card"><div className="empty">Belum ada data absensi bulan ini.</div></div> : (<>
          <div className="card"><div className="statgrid" style={{ marginTop: 0 }}>
            <div className="stat"><div className="k">Total Hadir</div><div className="v">{list.total}</div></div>
            <div className="stat"><div className="k">Terlambat (halaman ini)</div><div className="v">{rows.filter((a) => a.terlambat).length}</div></div>
          </div></div>
          {rows.map((a) => (
            <div key={a.id} className="item">
              <div className="top">
                <div><div className="nm">{tglIndo(a.tanggal)}</div><div className="dt">{a.inTime || '--:--'} → {a.outTime || '--:--'}{a.durasi && ' · ' + a.durasi}</div></div>
                {a.jamMode === 'fleksibel' ? <span className="badge b-green">Fleksibel</span>
                  : a.terlambat ? <span className="badge b-red">Telat {a.menitTelat}m</span> : <span className="badge b-green">Tepat waktu</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {a.kerjaDari && <span className="badge b-blue">{a.kerjaDari === 'wfh' ? 'WFH' : 'Dinas luar kota'}</span>}
                {a.izinSesi && <span className="badge b-amber">Izin ½ hari {a.izinSesi}</span>}
                {a.shiftNama && a.jamMode === 'shift' && <span className="badge b-blue">{a.shiftNama}</span>}
                {a.kurangMenit > 0 && <span className="badge b-amber">Kurang {jamKerjaTeks(a.kurangMenit)}</span>}
                {a.lemburMenit > 0 && <span className="badge b-purple">Lembur {jamKerjaTeks(a.lemburMenit)}</span>}
                {a.langgarInti && <span className="badge b-amber">Luar jam inti</span>}
                {a.lupaOut && <span className="badge b-red">Lupa clock out</span>}
                {a.dikoreksi && <span className="badge b-amber">Dikoreksi {a.koreksiOleh}</span>}
              </div>
              {a.dikoreksi && a.koreksiCatatan && <div className="tiny muted" style={{ marginTop: 4 }}>Catatan HC: {a.koreksiCatatan}</div>}
              {a.mode === 'lapangan' && <div className="tiny" style={{ color: 'var(--purple)', marginTop: 4 }}>Lapangan · {km(a.inJarakBase || 0)} dari {a.baseLabel || 'titik awal'}</div>}
              {(a.inLuar || a.outLuar) && <div className="tiny" style={{ color: 'var(--warning)', marginTop: 4 }}>Absen di luar area kantor</div>}
              <div className="row" style={{ marginTop: 8 }}>
                {a.inPhoto ? <img src={a.inPhoto} className="thumb" style={{ aspectRatio: '1/1', cursor: 'pointer' }} loading="lazy" alt="foto masuk" onClick={() => lihatFoto(a, 'in')} /> : <div />}
                {a.outPhoto ? <img src={a.outPhoto} className="thumb" style={{ aspectRatio: '1/1', cursor: 'pointer' }} loading="lazy" alt="foto pulang" onClick={() => lihatFoto(a, 'out')} /> : <div />}
              </div>
            </div>
          ))}
          <NavigasiHalaman page={list.page} total={list.total} totalPages={list.totalPages} ubah={setPage} />
        </>)}
    </div>
  );
}
