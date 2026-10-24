import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolConnection } from 'mysql2/promise';

/* Data yang hidup selama SATU permintaan API: cache pengaturan, cabang, shift,
   kalender libur, dan koneksi transaksi. Sengaja tidak disimpan di memori proses
   agar perubahan pengaturan langsung berlaku di permintaan berikutnya. */
export interface Konteks {
  koneksi?: PoolConnection;
  cache: Map<string, unknown>;
  ip: string;
  ua: string;
}

const als = new AsyncLocalStorage<Konteks>();

export function jalankanDalamKonteks<T>(k: Omit<Konteks, 'cache'>, fn: () => Promise<T>): Promise<T> {
  return als.run({ ...k, cache: new Map() }, fn);
}
export function konteks(): Konteks | undefined {
  return als.getStore();
}
/* cache sederhana per permintaan */
export async function simpanSementara<T>(kunci: string, ambil: () => Promise<T>): Promise<T> {
  const k = konteks();
  if (!k) return ambil();
  if (k.cache.has(kunci)) return k.cache.get(kunci) as T;
  const v = await ambil();
  k.cache.set(kunci, v);
  return v;
}
export function hapusSementara(awalan: string): void {
  const k = konteks();
  if (!k) return;
  for (const kunci of [...k.cache.keys()]) if (kunci.startsWith(awalan)) k.cache.delete(kunci);
}
