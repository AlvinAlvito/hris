/* Field biodata: [panel, kunci, label, jenis?, pilihan?] — dipakai form HC dan profil sendiri */
export type FieldBio = [string, string, string, ('sel' | 'date')?, [string, string][]?];

export const FIELD_BIO: FieldBio[] = [
  ['bio', 'jk', 'Jenis kelamin', 'sel', [['', '—'], ['L', 'Laki-laki'], ['P', 'Perempuan']]],
  ['bio', 'tempatLahir', 'Tempat lahir'], ['bio', 'tglLahir', 'Tanggal lahir', 'date'],
  ['bio', 'agama', 'Agama', 'sel', [['', '—'], ['Islam', 'Islam'], ['Kristen', 'Kristen'], ['Katolik', 'Katolik'], ['Hindu', 'Hindu'], ['Buddha', 'Buddha'], ['Konghucu', 'Konghucu'], ['Lainnya', 'Lainnya']]],
  ['bio', 'statusNikah', 'Status pernikahan', 'sel', [['', '—'], ['lajang', 'Lajang'], ['menikah', 'Menikah'], ['cerai', 'Cerai']]],
  ['bio', 'noKtp', 'No. KTP (NIK kependudukan)'], ['bio', 'noHp', 'No. HP / WhatsApp'], ['bio', 'email', 'Email'],
  ['bio', 'alamat', 'Alamat sesuai KTP'], ['bio', 'alamatDomisili', 'Alamat domisili'],
  ['bio', 'pendidikan', 'Pendidikan terakhir', 'sel', [['', '—'], ['SMA/SMK', 'SMA/SMK'], ['D3', 'D3'], ['S1', 'S1'], ['S2', 'S2'], ['S3', 'S3'], ['Lainnya', 'Lainnya']]],
  ['bio', 'jurusan', 'Jurusan'], ['bio', 'institusi', 'Institusi / kampus'],
  ['bank', 'bankNama', 'Nama bank'], ['bank', 'bankRekening', 'Nomor rekening'], ['bank', 'bankAtasNama', 'Atas nama rekening'],
  ['bank', 'npwp', 'NPWP'], ['bank', 'bpjsKesNo', 'No. BPJS Kesehatan'], ['bank', 'bpjsTkNo', 'No. BPJS Ketenagakerjaan'],
  ['darurat', 'daruratNama', 'Nama kontak darurat'], ['darurat', 'daruratHubungan', 'Hubungan (mis. istri, ayah)'], ['darurat', 'daruratHp', 'No. HP kontak darurat'],
];
export const STATUS_KERJA: Record<string, string> = {
  tetap: 'Tetap', kontrak: 'Kontrak', probation: 'Masa percobaan', magang: 'Magang', harian: 'Harian', freelance: 'Freelance',
};
export function teksPilihan(f: FieldBio, v: unknown) {
  if (f[3] !== 'sel') return String(v ?? '') || '—';
  return f[4]!.find((o) => o[0] === String(v ?? ''))?.[1] || '—';
}
