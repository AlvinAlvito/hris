'use client';
/* Bagian bersama modul keuangan: isian rupiah, sakelar, slip gaji */
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { angka, periodeTeks, rupiah } from '@/lib/klien/format';

type Data = Record<string, any>;

/* isian nominal dengan pemisah ribuan; nilai berupa angka */
export function InputUang({ nilai, ubah, autoFocus }: { nilai: number; ubah: (n: number) => void; autoFocus?: boolean }) {
  return <input inputMode="numeric" placeholder="0" autoFocus={autoFocus} value={nilai ? angka(nilai) : ''} onChange={(e) => ubah(+e.target.value.replace(/\D/g, '') || 0)} />;
}
export function Sakelar({ on, ubah, judul, ket }: { on: boolean; ubah: (v: boolean) => void; judul: string; ket?: string }) {
  return (<div className="switch"><div><b>{judul}</b>{ket && <div className="tiny muted">{ket}</div>}</div>
    <div className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} tabIndex={0} onClick={() => ubah(!on)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); ubah(!on); } }} /></div>);
}

/* ================= SLIP GAJI ================= */
export function useLihatSlip() {
  const { bukaSheet, tutupSheet, galat } = useAplikasi();
  return (id: number) => api<Data>('py_slip', { id }).then((d) => {
    const x = d.slip, b: Data[] = x.rincian?.baris ?? [], pj = x.rincian?.pajak;
    const baris = (jenis: string) => b.filter((r) => r.jenis === jenis).map((r, n) => (
      <tr key={n}><td>{r.nama}{r.ket && <div style={{ fontSize: 11, color: '#6b7280' }}>{r.ket}</div>}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{rupiah(r.nominal)}</td></tr>));
    const tr = (k: string, v: number | string, tot = false) => <tr className={tot ? 'tot' : undefined}><td>{k}</td><td style={{ textAlign: 'right' }}>{typeof v === 'number' ? rupiah(v) : v}</td></tr>;
    const cetak = () => { document.body.classList.add('cetak'); setTimeout(() => { window.print(); document.body.classList.remove('cetak'); }, 50); };
    bukaSheet(<>
      <div className="slip">
        <div className="kop"><img src={d.logo || '/logo-posi.png'} alt="" />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 16 }}>{d.perusahaan}</div><div style={{ color: '#6b7280' }}>SLIP GAJI · {periodeTeks(x.periode).toUpperCase()}</div></div>
          {x.statusPeriode !== 'final' && <span className="badge b-amber">DRAF</span>}</div>
        <table style={{ marginTop: 12 }}><tbody><tr>
          <td style={{ border: 0, width: '50%' }}><b>{x.nama}</b><br />NIK {x.nik}<br />{x.jabatan}{x.dept && ' · ' + x.dept}</td>
          <td style={{ border: 0, textAlign: 'right' }}>PTKP {x.ptkp}<br />NPWP {x.npwp || '-'}<br />Hadir {x.hariHadir} hari{x.hariMangkir ? ' · mangkir ' + x.hariMangkir : ''}</td></tr></tbody></table>
        <div className="grid-2" style={{ gap: 18 }}>
          <div><h4>Pendapatan</h4><table><tbody>{baris('pendapatan')}{tr('Total pendapatan', x.totalPendapatan, true)}</tbody></table></div>
          <div><h4>Potongan</h4><table><tbody>{baris('potongan')}{tr('Total potongan', x.totalPotongan, true)}</tbody></table></div>
        </div>
        <div className="thp"><span style={{ fontWeight: 700 }}>Take Home Pay</span><b>{rupiah(x.thp)}</b></div>
        <h4>Ditanggung perusahaan (tidak dipotong dari gaji)</h4><table><tbody>{baris('info')}</tbody></table>
        <h4>Perhitungan PPh 21</h4><table><tbody>
          {tr('Penghasilan bruto untuk pajak', x.brutoPajak)}{tr('Metode', x.pph21Metode)}
          {pj && <>{tr('Bruto setahun', pj.bruto)}{tr('Biaya jabatan', pj.biayaJabatan)}{tr('Iuran JHT + JP pegawai', pj.iuran)}{tr('PTKP', pj.ptkp)}
            {tr('PKP', pj.pkp)}{tr('PPh 21 setahun', pj.pphSetahun)}{tr('Sudah dipotong Jan–Nov', pj.sudahDipotong)}</>}
          {tr('PPh 21 bulan ini', x.pph21, true)}</tbody></table>
        {d.catatan && <div style={{ marginTop: 14, fontSize: 11, color: '#6b7280' }}>{d.catatan}</div>}
      </div>
      <div className="row noprint" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={tutupSheet}>Tutup</button>
        <button className="btn" onClick={cetak}><Ikon n="printer" />Cetak / Simpan PDF</button>
      </div>
    </>, { besar: true });
  }).catch(galat);
}
