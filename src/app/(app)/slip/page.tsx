'use client';
/* Slip gaji milik sendiri (hanya periode yang sudah final) */
import { useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { useLihatSlip } from '@/components/Keuangan';
import { api } from '@/lib/klien/api';
import { periodeTeks, rupiah } from '@/lib/klien/format';

type Data = Record<string, any>;

export default function SlipSaya() {
  const { galat } = useAplikasi();
  const lihat = useLihatSlip();
  const [l, setL] = useState<Data[] | null>(null);
  useEffect(() => { api<Data[]>('py_slip_saya', {}).then(setL).catch(galat); }, [galat]);
  return (
    <div className="sempit">
      <div className="card"><h3><Ikon n="banknote" />Slip Gaji Saya</h3>
        <div className="tiny muted">Slip muncul setelah payroll bulan tersebut difinalkan HC. Ketuk untuk melihat rincian & mencetak.</div>
        {!l ? <div className="skel" style={{ height: 70, marginTop: 12 }} /> : l.length ? l.map((x) => (
          <div key={x.id} className="pg-item" role="button" tabIndex={0} onClick={() => lihat(x.id)} onKeyDown={(e) => { if (e.key === 'Enter') lihat(x.id); }}>
            <div className="ic"><Ikon n="banknote" /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="jd">{periodeTeks(x.periode)}</div>
              <div className="ringkas">Pendapatan {rupiah(x.totalPendapatan)} · potongan {rupiah(x.totalPotongan)}</div></div>
            <div style={{ textAlign: 'right' }}><div className="tiny muted">Diterima</div><b className="num" style={{ fontSize: 16 }}>{rupiah(x.thp)}</b></div>
          </div>)) : <div className="empty"><Ikon n="banknote" />Belum ada slip gaji yang difinalkan.</div>}
      </div>
    </div>
  );
}
