'use client';
import { bacaBerkas } from '@/lib/klien/berkas';
import { Ikon } from './Ikon';

export function InputBuktiPengajuan({ link, setLink, file, setFile }: {
  link: string; setLink: (v: string) => void; file: File | null; setFile: (v: File | null) => void;
}) {
  return <div className="bukti-pengajuan">
    <label>Bukti pengajuan <span className="tiny">(opsional · gambar/PDF atau tautan Drive/Sheet)</span></label>
    <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    {file && <div className="tiny muted" style={{ marginTop: 4 }}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</div>}
    <div className="tiny muted center" style={{ margin: '6px 0' }}>atau</div>
    <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/..." />
  </div>;
}

export async function dataBukti(file: File | null) {
  if (!file) return null;
  const b = await bacaBerkas(file, 1600);
  return { nama: b.nama, data: b.data };
}

export function TautanBukti({ link }: { link?: string }) {
  if (!link) return null;
  const internal = link.startsWith('/api/dok_unduh?id=');
  return <a className="btn ghost sm auto" href={link} target={internal ? undefined : '_blank'} rel={internal ? undefined : 'noreferrer'}><Ikon n="external-link" />{internal ? 'Buka bukti terlampir' : 'Lihat tautan bukti'}</a>;
}
