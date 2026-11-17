'use client';
/* KPI Saya: KPI & KBI bulanan (diisi atasan / HC, diverifikasi atasan) dan riwayat skor 12 bulan — hanya dilihat karyawan */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { bulanTeks, daftarPeriode, GrafikRiwayat, LembarKpi, type LaporKpi, type RiwayatKpi } from '@/components/KpiLapor';
import { api } from '@/lib/klien/api';

type Data = { kosong: boolean; periode: string; lapor?: LaporKpi; riwayat: RiwayatKpi[] };

export default function KpiSaya() {
  const { galat } = useAplikasi();
  const [periode, setPeriode] = useState(daftarPeriode(1)[0]);
  const [d, setD] = useState<Data | null>(null);
  const muat = useCallback(() => { api<Data>('kpi_saya', { periode }, true).then(setD).catch(galat); }, [periode, galat]);
  useEffect(() => { setD(null); muat(); }, [muat]);
  return (
    <div className="sempit">
      <div className="card kp-pilih-bulan">
        <h3 style={{ margin: 0 }}><Ikon n="target" />KPI Saya</h3>
        <select value={periode} onChange={(e) => setPeriode(e.target.value)} aria-label="Pilih bulan">{daftarPeriode(12).map((p) => <option key={p} value={p}>{bulanTeks(p)}</option>)}</select>
      </div>
      {!d ? <div className="card"><div className="skel" style={{ height: 260 }} /></div>
        : d.kosong ? <div className="card"><div className="empty"><Ikon n="target" />KPI Anda untuk {bulanTeks(d.periode)} belum diatur HC.<br /><span className="tiny">Hubungi HC bila Anda merasa seharusnya sudah memiliki target KPI.</span></div></div>
          : <div className="card"><LembarKpi key={d.lapor!.id + d.lapor!.status} lapor={d.lapor!} mode="karyawan" segarkan={muat} /></div>}
      <div className="card"><h3><Ikon n="trending-up" />Riwayat Skor KPI</h3>
        <GrafikRiwayat riwayat={d?.riwayat ?? []} pilih={setPeriode} />
        <div className="tiny muted" style={{ marginTop: 8 }}>Batang pudar = belum final. Ketuk batang untuk membuka bulan tersebut.</div>
      </div>
      <div className="card"><h3><Ikon n="info" />Cara Penilaian</h3>
        <ul className="kp-cara">
          <li><b>Pencapaian KPI</b> = realisasi ÷ target (untuk indikator "makin kecil makin baik": target ÷ realisasi), maksimal 100%.</li>
          <li><b>Skor KPI</b> = rata-rata pencapaian sesuai bobot tiap indikator.</li>
          <li><b>Skor KBI</b> (perilaku) = total skor realisasi ÷ total skor target, skala 1–5 per aspek.</li>
          <li>Predikat KPI: <b>≥ 100</b> Sangat Baik · <b>90–99</b> Baik · <b>75–89</b> Cukup · <b>&lt; 75</b> Perlu Perbaikan.</li>
          <li>KPI & KBI diisi oleh <b>atasan / HC</b>, lalu diverifikasi atasan. Nilai menjadi final setelah disetujui.</li>
        </ul>
      </div>
    </div>
  );
}
