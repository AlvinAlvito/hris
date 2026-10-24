'use client';
/* Penyedia global: pengguna yang masuk, pengaturan, kotak persetujuan, toast, sheet & dialog. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { api, saatSesiHabis } from '@/lib/klien/api';
import { Ikon } from './Ikon';

export type Me = Record<string, any> & { id: number; nik: string; nama: string; role: string };
export type Settings = Record<string, any> & { perusahaan: string };
export interface Inbox { item: any[]; semua: { kunci: string; judul: string; jumlah: number; ikon: string; tujuan: string }[]; total: number }

interface NilaiAplikasi {
  me: Me | null; settings: Settings; setMe: (m: Me | null) => void; setSettings: (s: Settings) => void;
  inbox: Inbox; muatInbox: () => void;
  toast: (pesan: string, buruk?: boolean) => void;
  galat: (e: unknown) => void;
  bukaSheet: (isi: ReactNode, opsi?: { besar?: boolean; saatTutup?: () => void }) => void;
  tutupSheet: () => void;
  yakin: (judul: string, ket?: string, opsi?: { ya?: string }) => Promise<boolean>;
  tanya: (label: string, nilai?: string, opsi?: { judul?: string; panjang?: boolean; wajib?: boolean; ikon?: string }) => Promise<string | null>;
  terapkanMode: (mode?: string) => void;
}
const Ktx = createContext<NilaiAplikasi | null>(null);
export function useAplikasi() {
  const k = useContext(Ktx);
  if (!k) throw new Error('useAplikasi di luar <PenyediaAplikasi>');
  return k;
}
export const isAdminUp = (m?: Me | null) => !!m && (m.role === 'admin' || m.role === 'direktur');
export const isDir = (m?: Me | null) => !!m && m.role === 'direktur';

interface Toast { id: number; pesan: string; buruk: boolean; keluar: boolean }
interface Dialog { jenis: 'yakin' | 'tanya'; judul: string; ket?: string; label?: string; nilai?: string; panjang?: boolean; wajib?: boolean; ya?: string; ikon?: string; selesai: (v: any) => void }

export function PenyediaAplikasi({ awal, children }: { awal: { me: Me | null; settings: Settings }; children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(awal.me);
  const [settings, setSettings] = useState<Settings>(awal.settings);
  const [inbox, setInbox] = useState<Inbox>({ item: [], semua: [], total: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheet, setSheet] = useState<{ isi: ReactNode; besar?: boolean; saatTutup?: () => void } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [siap, setSiap] = useState(false);
  const idToast = useRef(0);

  useEffect(() => { setSiap(true); saatSesiHabis(() => { setMe(null); router.replace('/masuk'); }); }, [router]);

  const toast = useCallback((pesan: string, buruk = false) => {
    const id = ++idToast.current;
    setToasts((t) => [...t, { id, pesan, buruk, keluar: false }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, keluar: true } : x))), 3600);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3900);
  }, []);
  const galat = useCallback((e: unknown) => toast(e instanceof Error ? e.message : 'Terjadi kesalahan', true), [toast]);

  const muatInbox = useCallback(() => {
    api<Inbox>('inbox_ringkas', {}, true).then(setInbox).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    muatInbox();
    const t = setInterval(muatInbox, 90000);
    return () => clearInterval(t);
  }, [me, muatInbox]);

  // callback penutup disimpan di ref agar dipanggil tepat sekali (updater state bisa berjalan dua kali)
  const saatTutupRef = useRef<(() => void) | undefined>(undefined);
  const tutupSheet = useCallback(() => {
    const fn = saatTutupRef.current; saatTutupRef.current = undefined; fn?.();
    setSheet(null);
    document.body.style.overflow = '';
  }, []);
  const bukaSheet = useCallback((isi: ReactNode, opsi: { besar?: boolean; saatTutup?: () => void } = {}) => {
    saatTutupRef.current = opsi.saatTutup;
    setSheet({ isi, besar: opsi.besar });
    document.body.style.overflow = 'hidden';
  }, []);

  const yakin = useCallback((judul: string, ket?: string, opsi: { ya?: string } = {}) =>
    new Promise<boolean>((selesai) => setDialog({ jenis: 'yakin', judul, ket, ya: opsi.ya, selesai })), []);
  const tanya = useCallback((label: string, nilai = '', opsi: { judul?: string; panjang?: boolean; wajib?: boolean; ikon?: string } = {}) =>
    new Promise<string | null>((selesai) => setDialog({ jenis: 'tanya', judul: opsi.judul || 'Konfirmasi', label, nilai, panjang: opsi.panjang,
      wajib: opsi.wajib ?? (/alasan penolakan|alasan menolak/i.test(label) && !/opsional/i.test(label)), ikon: opsi.ikon, selesai })), []);

  const terapkanMode = useCallback((mode?: string) => {
    const m = mode || 'auto';
    const gelap = m === 'gelap' || (m === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-mode', gelap ? 'gelap' : 'terang');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', gelap ? '#06111f' : '#0e2a55');
    try { localStorage.setItem('posi.mode', m); } catch { /* mode privat */ }
  }, []);
  useEffect(() => { if (me) terapkanMode(me.modeTampilan); }, [me, terapkanMode]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dialog) { dialog.selesai(dialog.jenis === 'yakin' ? false : null); setDialog(null); } else if (sheet) tutupSheet();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [dialog, sheet, tutupSheet]);

  const nilai = useMemo<NilaiAplikasi>(() => ({
    me, settings, setMe, setSettings, inbox, muatInbox, toast, galat, bukaSheet, tutupSheet, yakin, tanya, terapkanMode,
  }), [me, settings, inbox, muatInbox, toast, galat, bukaSheet, tutupSheet, yakin, tanya, terapkanMode]);

  return (
    <Ktx.Provider value={nilai}>
      {children}
      {siap && createPortal(
        <>
          {sheet && (
            <div className="mask" onMouseDown={(e) => { if (e.target === e.currentTarget) tutupSheet(); }}>
              <div className={'sheet' + (sheet.besar ? ' big' : '')} role="dialog" aria-modal="true">{sheet.isi}</div>
            </div>
          )}
          {dialog && <KotakDialog d={dialog} tutup={(v) => { dialog.selesai(v); setDialog(null); }} toast={toast} />}
          <div id="toastRoot">
            {toasts.map((t) => (
              <div key={t.id} className={'toast' + (t.buruk ? ' bad' : '') + (t.keluar ? ' keluar' : '')}>
                <div className="ic"><Ikon n={t.buruk ? 'circle-alert' : 'circle-check'} /></div><div>{t.pesan}</div>
              </div>
            ))}
          </div>
        </>, document.body)}
    </Ktx.Provider>
  );
}

function KotakDialog({ d, tutup, toast }: { d: Dialog; tutup: (v: any) => void; toast: (p: string, b?: boolean) => void }) {
  const [v, setV] = useState(d.nilai ?? '');
  const bahaya = d.jenis === 'yakin' && /hapus|batalkan|tolak|keluar/i.test(d.judul);
  const ok = () => {
    if (d.jenis === 'yakin') return tutup(true);
    if (d.wajib && !v.trim()) { toast('Isian ini wajib diisi', true); return; }
    tutup(v);
  };
  return (
    <div className="mask dlg">
      <div className="sheet">
        <h3><Ikon n={d.ikon || (d.jenis === 'tanya' ? 'pencil' : bahaya ? 'circle-alert' : 'info')} />{d.judul}</h3>
        {d.ket && <div className="muted">{d.ket}</div>}
        {d.jenis === 'tanya' && (
          <>
            <label style={{ marginTop: 4 }}>{d.label}</label>
            {d.panjang
              ? <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} />
              : <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }} />}
          </>
        )}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={() => tutup(d.jenis === 'yakin' ? false : null)}>{d.jenis === 'yakin' ? 'Tidak' : 'Batal'}</button>
          <button className={'btn' + (bahaya ? ' red' : '')} onClick={ok} autoFocus={d.jenis === 'yakin'}>{d.ya || (d.jenis === 'yakin' ? 'Ya, lanjutkan' : 'OK')}</button>
        </div>
      </div>
    </div>
  );
}
