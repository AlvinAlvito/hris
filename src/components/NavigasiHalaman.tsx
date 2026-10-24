'use client';
import { Ikon } from './Ikon';

export interface HalamanData<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number }

export function NavigasiHalaman({ page, total, totalPages, ubah }: { page: number; total: number; totalPages: number; ubah: (p: number) => void }) {
  if (!total) return null;
  return <div className="paginasi">
    <span className="tiny muted">{total} data · halaman {page} dari {totalPages}</span>
    <div className="paginasi-tombol">
      <button className="btn ghost sm auto" disabled={page <= 1} onClick={() => ubah(page - 1)}><Ikon n="chevron-left" />Sebelumnya</button>
      <button className="btn ghost sm auto" disabled={page >= totalPages} onClick={() => ubah(page + 1)}>Berikutnya<Ikon n="chevron-right" /></button>
    </div>
  </div>;
}
