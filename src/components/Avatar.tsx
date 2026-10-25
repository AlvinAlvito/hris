'use client';
/* Foto profil, atau inisial dengan warna biru yang tetap untuk setiap nama.
   Bila berkas foto gagal dimuat (terhapus / belum tersalin), kembali ke inisial. */
import { useState } from 'react';

export function Avatar({ u, ukuran = 36 }: { u: { nama?: string; foto?: string } | null; ukuran?: number }) {
  const [gagal, setGagal] = useState<string | null>(null);
  const nama = u?.nama || '?';
  const ini = nama.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  let hue = 0;
  for (let i = 0; i < nama.length; i++) hue = (hue * 31 + nama.charCodeAt(i)) % 360;
  const gaya = { width: ukuran, height: ukuran, fontSize: Math.round(ukuran * 0.38) };
  if (u?.foto && gagal !== u.foto) return <span className="av" style={gaya}><img src={u.foto} alt="" loading="lazy" onError={() => setGagal(u.foto!)} /></span>;
  return (
    <span className="av" style={{ ...gaya, background: `linear-gradient(135deg,hsl(${195 + (hue % 35)} 62% 50%),hsl(${212 + (hue % 20)} 68% 30%))` }}>{ini}</span>
  );
}
