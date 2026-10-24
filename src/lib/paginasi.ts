export interface ParamHalaman { page: number; limit: 8; offset: number; cari: string }
export interface HasilHalaman<T> { items: T[]; page: number; pageSize: 8; total: number; totalPages: number }

export function paramHalaman(m: Record<string, any>): ParamHalaman {
  const page = Math.max(1, Math.min(100000, Math.trunc(Number(m.page) || 1)));
  return { page, limit: 8, offset: (page - 1) * 8, cari: String(m.search ?? '').trim().slice(0, 100) };
}

export function hasilHalaman<T>(items: T[], total: number, page: number): HasilHalaman<T> {
  const n = Math.max(0, Number(total) || 0);
  return { items, page, pageSize: 8, total: n, totalPages: Math.max(1, Math.ceil(n / 8)) };
}

export function polaCari(teks: string) { return '%' + teks.replace(/[\\%_]/g, '\\$&') + '%'; }
