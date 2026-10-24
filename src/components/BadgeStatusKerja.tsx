import { STATUS_KERJA } from '@/lib/klien/biodata';
import { tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;

/* status kepegawaian + pengingat kontrak */
export function BadgeStatusKerja({ u }: { u: Data }) {
  const w: Record<string, string> = { tetap: 'b-green', kontrak: 'b-blue', probation: 'b-amber', magang: 'b-purple', harian: 'b-gray', freelance: 'b-gray' };
  const st = u.statusKerja || 'tetap';
  let ket = null;
  if (u.kontrakSelesai) {
    const sisa = Math.round((new Date(u.kontrakSelesai + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 864e5);
    ket = sisa < 0 ? <div className="tiny" style={{ color: 'var(--danger)' }}>kontrak lewat {-sisa} hr</div>
      : sisa <= 45 ? <div className="tiny" style={{ color: 'var(--warning)' }}>habis {sisa} hr lagi</div>
        : <div className="tiny muted">s.d. {tglPendek(u.kontrakSelesai)}</div>;
  }
  return <><span className={'badge ' + (w[st] || 'b-gray')}>{st === 'probation' ? 'Percobaan' : STATUS_KERJA[st] || '—'}</span>{ket}</>;
}
