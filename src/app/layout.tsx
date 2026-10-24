import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HRIS POSI',
  description: 'Sistem kepegawaian Pusat Olimpiade Sains Indonesia',
  manifest: '/api/br_manifest',
  icons: { icon: '/favicon.png', apple: '/ikon-192.png' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#0e2a55',
};

/* mode terang/gelap diterapkan sebelum halaman tampil agar tidak berkedip */
const skripMode = `(function(){try{var m=localStorage.getItem('posi.mode')||'auto',h=document.documentElement;
var g=m==='gelap'||(m==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);h.setAttribute('data-mode',g?'gelap':'terang');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-tema="posi" data-mode="terang" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: skripMode }} /></head>
      <body>{children}</body>
    </html>
  );
}
