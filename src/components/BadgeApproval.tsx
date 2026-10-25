'use client';
/* Status persetujuan satu baris absensi oleh atasan */
import { Ikon } from './Ikon';

export function BadgeApproval({ a }: { a: { approval?: string; approvalOleh?: string; approvalCatatan?: string } }) {
  if (a.approval === 'disetujui') return <span className="badge b-green" title={a.approvalOleh}><Ikon n="check" />Disetujui</span>;
  if (a.approval === 'ditolak') return <span className="badge b-red" title={a.approvalCatatan}><Ikon n="x" />Ditolak</span>;
  return <span className="badge b-amber"><Ikon n="hourglass" />Menunggu approval</span>;
}
