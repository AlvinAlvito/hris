'use client';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { TesPilihanGanda } from '../TesRekrutmen';

export function HalamanTes({ token }: { token: string }) {
  const { settings } = useAplikasi();
  return (
    <div className="rk-portal">
      <header className="rk-kepala">
        <a href="/rekrutmen" className="rk-logo"><img src={settings.logo || '/logo-posi.png'} alt={settings.perusahaan} /></a>
        <span className="rk-pita"><Ikon n="briefcase" />Karier</span>
      </header>
      <TesPilihanGanda token={token} />
      <footer className="rk-kaki">© {new Date().getFullYear()} {settings.perusahaan} · Data lamaran hanya digunakan untuk keperluan rekrutmen.</footer>
    </div>
  );
}
