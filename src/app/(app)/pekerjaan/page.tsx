'use client';
/* Pekerjaan Saya: catat pekerjaan harian (to-do), lihat utilisasi beban kerja mingguan / bulanan dan komentar atasan */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { DaftarLog, FormLog, MeterUtilisasi, PerKategori, PilihPeriode, jam, type Kategori, type Log, type Periode, type Ringkas } from '@/components/LogKerja';
import { api } from '@/lib/klien/api';

type Data = { periode: Periode; ringkas: Ringkas; kapasitasHarian: Record<string, number>; log: Log[]; kategori: Kategori[]; batas: { bawah: number; atas: number };
  hariIni: string; perKategori: { kategori: string; menit: number; jumlah: number }[] };

export default function PekerjaanSaya() {
  const { galat, toast } = useAplikasi();
  const [pilih, setPilih] = useState<{ jenis: 'minggu' | 'bulan'; tanggal: string }>({ jenis: 'minggu', tanggal: '' });
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {   // dari notifikasi komentar: /pekerjaan?tanggal=YYYY-MM-DD
    const t = new URLSearchParams(window.location.search).get('tanggal');
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) setPilih((x) => ({ ...x, tanggal: t }));
  }, []);
  const muat = useCallback(() => { api<Data>('log_saya', pilih, true).then(setD).catch(galat); }, [pilih, galat]);
  useEffect(() => { muat(); }, [muat]);
  const salin = () => api<{ pesan: string }>('log_salin', {}).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  const r = d?.ringkas;
  return (
    <div className="lk-halaman">
      <div className="card"><PilihPeriode p={d?.periode ?? null} ubah={(jenis, tanggal) => setPilih({ jenis, tanggal })} /></div>
      {!d || !r ? <div className="card"><div className="skel" style={{ height: 260 }} /></div> : (<div className="grid-2 lk-grid">
        <div>
          <div className="card"><h3><Ikon n="plus" />Catat Pekerjaan</h3>
            <FormLog key={d.periode.dari} kategori={d.kategori} hariIni={d.hariIni} selesai={muat} />
            <button type="button" className="btn ghost sm auto lk-salin" onClick={salin}><Ikon n="copy" />Salin pekerjaan hari terakhir sebagai rencana</button>
          </div>
          <div className="card"><h3><Ikon n="list-checks" />Catatan Pekerjaan <span className="m">· {d.log.length}</span></h3>
            <DaftarLog log={d.log} kapasitasHarian={d.kapasitasHarian} pemilik kategori={d.kategori} hariIni={d.hariIni} segarkan={muat} /></div>
        </div>
        <div>
          <div className="card"><h3><Ikon n="chart-pie" />Beban Kerja Saya</h3>
            <MeterUtilisasi r={r} batas={d.batas} />
            <div className="statgrid g3" style={{ marginTop: 14 }}>
              <div className="stat"><div className="k">Jam kerja</div><div className="v">{jam(r.menit)}</div></div>
              <div className="stat"><div className="k">Pekerjaan selesai</div><div className="v">{r.selesai}<span className="tiny muted"> / {r.jumlah}</span></div></div>
              <div className="stat"><div className="k">Hari terisi</div><div className="v">{r.hariTerisi}<span className="tiny muted"> / {r.hariKerja}</span></div></div>
            </div>
            <div className="tiny muted" style={{ marginTop: 10 }}>Utilisasi = total jam pekerjaan ÷ kapasitas jam kerja (hari kerja sesuai jadwal, tidak termasuk libur, cuti, dan izin).
              Status <b>Rencana</b> tidak dihitung.</div>
          </div>
          <div className="card"><h3><Ikon n="layers" />Waktu per Kategori</h3><PerKategori data={d.perKategori} /></div>
        </div>
      </div>)}
    </div>
  );
}
