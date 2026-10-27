/* Pemeriksa SQL untuk AI Asisten. Lapisan kedua setelah transaksi READ ONLY di database:
   hanya satu SELECT/WITH, hanya tabel yang diizinkan, tanpa kolom sensitif, tanpa fungsi berbahaya. */

/* tabel yang boleh dibaca AI */
export const TABEL_AI = [
  'users', 'absensi', 'ketidakhadiran', 'cuti', 'pengajuan', 'unit_organisasi', 'jabatan', 'cabang', 'hari_libur',
  'pengumuman', 'gaji_karyawan', 'komponen_gaji', 'gaji_komponen', 'payroll_periode', 'payroll_slip', 'payroll_penyesuaian', 'shift',
];
/* kolom yang tidak pernah boleh keluar ke AI (identitas sensitif, kredensial, jejak teknis) */
export const KOLOM_TERLARANG = [
  'pin_hash', 'no_ktp', 'npwp', 'bank_rekening', 'bank_atas_nama', 'bpjs_kes_no', 'bpjs_tk_no', 'alamat', 'alamat_domisili',
  'darurat_hp', 'ip', 'ua', 'endpoint', 'p256dh', 'auth', 'rincian',
];
const KATA_TERLARANG = /\b(insert|update|delete|replace|drop|alter|create|truncate|rename|grant|revoke|lock|unlock|call|handler|do|load_file|outfile|dumpfile|sleep|benchmark|get_lock|release_lock|information_schema|performance_schema|mysql|sys|prepare|execute|deallocate|set|into|procedure|load|xml|uuid_short)\b/i;

export function periksaSql(masukan: string): string {
  let sql = String(masukan ?? '').trim().replace(/;+\s*$/, '');
  if (!sql) throw new Error('SQL kosong');
  if (sql.length > 4000) throw new Error('SQL terlalu panjang');
  if (/;|--|\/\*|\*\/|#|@@|`/.test(sql)) throw new Error('SQL hanya boleh satu pernyataan, tanpa komentar, tanpa backtick');
  if (!/^(select|with)\b/i.test(sql)) throw new Error('Hanya pernyataan SELECT yang diizinkan');
  // abaikan isi string literal saat memeriksa kata kunci & identitas
  const tanpaTeks = sql.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const kata = KATA_TERLARANG.exec(tanpaTeks);
  if (kata) throw new Error(`Kata kunci "${kata[1]}" tidak diizinkan`);
  if (/\*/.test(tanpaTeks.replace(/count\s*\(\s*\*\s*\)/gi, ''))) throw new Error('Tuliskan nama kolom secara eksplisit (SELECT * tidak diizinkan; COUNT(*) boleh)');
  for (const k of KOLOM_TERLARANG) if (new RegExp(`\\b${k}\\b`, 'i').test(tanpaTeks)) throw new Error(`Kolom "${k}" bersifat rahasia dan tidak boleh dibaca`);
  // nama CTE (WITH x AS ...) boleh dipakai sebagai tabel
  const cte = new Set([...tanpaTeks.matchAll(/(?:\bwith\s+(?:recursive\s+)?|,\s*)([a-z_][a-z0-9_]*)\s+as\s*\(/gi)].map((m) => m[1].toLowerCase()));
  const tabel = [...tanpaTeks.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_.]*)/gi)].map((m) => m[1].toLowerCase());
  for (const t of tabel) {
    if (t.includes('.')) throw new Error('Gunakan nama tabel tanpa nama database');
    if (!TABEL_AI.includes(t) && !cte.has(t)) throw new Error(`Tabel "${t}" tidak tersedia untuk asisten`);
  }
  // FROM (subkueri) tetap diperiksa lewat aturan di atas karena seluruh teks dipindai
  return sql;
}
