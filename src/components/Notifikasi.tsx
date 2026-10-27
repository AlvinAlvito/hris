'use client';
/* Lonceng notifikasi (semua peran), banner ajakan mengaktifkan notifikasi, dan pengaturan notifikasi di Profil.
   Daftar diperbarui tiap 45 detik; notifikasi baru juga muncul sebagai toast saat aplikasi terbuka. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { aktifkanNotif, daftarkanSW, matikanNotif, statusNotif, tampilkanLokal, type StatusNotif } from '@/lib/klien/notif';

type Notif = { id: number; jenis: string; judul: string; isi: string; tautan: string; dibaca: boolean; waktu: string };
interface NilaiNotif { items: Notif[]; belum: number; muat: () => void; status: StatusNotif | null; cekStatus: () => void }
const Ktx = createContext<NilaiNotif | null>(null);
export const useNotif = () => useContext(Ktx);

const IKON: Record<string, string> = { pengingat: 'alarm-clock', approval: 'badge-check', pengajuan: 'send', absensi: 'fingerprint', pengumuman: 'megaphone', payroll: 'banknote', uji: 'bell' };

function waktuRelatif(w: string) {
  const t = new Date(String(w).replace(' ', 'T') + (/[zZ+]/.test(w) ? '' : '+07:00')).getTime(), d = Math.max(0, (Date.now() - t) / 1000);
  if (d < 60) return 'baru saja';
  if (d < 3600) return Math.floor(d / 60) + ' menit lalu';
  if (d < 86400) return Math.floor(d / 3600) + ' jam lalu';
  return Math.floor(d / 86400) + ' hari lalu';
}

export function PenyediaNotif({ children }: { children: ReactNode }) {
  const { toast } = useAplikasi();
  const [items, setItems] = useState<Notif[]>([]), [belum, setBelum] = useState(0), [status, setStatus] = useState<StatusNotif | null>(null);
  const terakhir = useRef<number | null>(null);
  const muat = useCallback(() => {
    api<{ belum: number; items: Notif[] }>('notif_daftar', {}, true).then((d) => {
      const lama = terakhir.current;
      const baru = lama === null ? [] : d.items.filter((x) => x.id > lama && !x.dibaca);
      terakhir.current = d.items[0]?.id ?? lama ?? 0;
      setItems(d.items); setBelum(d.belum);
      // notifikasi yang masuk saat aplikasi terbuka: tampilkan toast (push sistem ditangani service worker)
      for (const x of baru.slice(0, 3).reverse()) {
        toast(x.judul);
        if (document.visibilityState === 'hidden' && typeof Notification !== 'undefined' && Notification.permission === 'granted') void tampilkanLokal(x.judul, x.isi, x.tautan || '/');
      }
    }).catch(() => {});
  }, [toast]);
  const cekStatus = useCallback(() => { statusNotif().then(setStatus).catch(() => setStatus('tidak-didukung')); }, []);
  useEffect(() => {
    void daftarkanSW(); muat(); cekStatus();
    const t = setInterval(muat, 45_000);
    const lihat = () => { if (document.visibilityState === 'visible') muat(); };
    document.addEventListener('visibilitychange', lihat);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', lihat); };
  }, [muat, cekStatus]);
  return <Ktx.Provider value={{ items, belum, muat, status, cekStatus }}>{children}</Ktx.Provider>;
}

/* tombol lonceng di bilah atas */
export function LoncengNotif() {
  const n = useNotif();
  const { bukaSheet } = useAplikasi();
  if (!n) return null;
  return (
    <button type="button" className="tbtn" title="Notifikasi" aria-label={`Notifikasi${n.belum ? `, ${n.belum} belum dibaca` : ''}`} onClick={() => bukaSheet(<PanelNotif n={n} />)}>
      <Ikon n="bell" />{n.belum ? <span className="dot">{n.belum > 99 ? '99+' : n.belum}</span> : null}
    </button>
  );
}

/* Panel dibuka lewat bukaSheet (di luar PenyediaNotif), jadi data & pemuat diteruskan lewat prop
   dan daftar dimuat ulang sendiri setelah tindakan. */
function PanelNotif({ n: awal }: { n: NilaiNotif }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const router = useRouter();
  const [items, setItems] = useState(awal.items), [belum, setBelum] = useState(awal.belum);
  const segarkan = useCallback(() => {
    awal.muat();
    api<{ belum: number; items: Notif[] }>('notif_daftar', {}, true).then((d) => { setItems(d.items); setBelum(d.belum); }).catch(() => {});
  }, [awal]);
  useEffect(() => { segarkan(); }, [segarkan]);
  const n = { ...awal, items, belum };
  const buka = (x: Notif) => {
    if (!x.dibaca) api('notif_baca', { id: x.id }, true).then(segarkan).catch(() => {});
    if (x.tautan) { tutupSheet(); router.push(x.tautan); }
  };
  const bacaSemua = () => api('notif_baca', {}, true).then(segarkan).catch(galat);
  const bersihkan = () => api<{ pesan: string }>('notif_hapus_semua', {}, true).then((r) => { toast(r.pesan); segarkan(); }).catch(galat);
  return (<>
    <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="bell" />Notifikasi</h3>
      <div className="nf-aksi">
        <button className="btn ghost sm auto" disabled={!n.belum} onClick={bacaSemua}><Ikon n="check-check" />Tandai dibaca</button>
        <button className="btn ghost sm auto" title="Hapus yang sudah dibaca" aria-label="Hapus notifikasi yang sudah dibaca" onClick={bersihkan}><Ikon n="trash-2" /></button></div></div>
    <KartuIzinNotif ringkas nilai={awal} />
    {n.items.length ? <div className="nf-daftar">{n.items.map((x) => (
      <button key={x.id} type="button" className={'nf-item' + (x.dibaca ? '' : ' baru')} onClick={() => buka(x)}>
        <span className={'nf-ic j-' + x.jenis}><Ikon n={IKON[x.jenis] ?? 'bell'} /></span>
        <span className="nf-teks"><b>{x.judul}</b>{x.isi && <span className="nf-isi">{x.isi}</span>}<span className="tiny muted">{waktuRelatif(x.waktu)}</span></span>
        {!x.dibaca && <span className="nf-titik" aria-label="belum dibaca" />}
      </button>))}</div>
      : <div className="empty"><Ikon n="bell" />Belum ada notifikasi.</div>}
  </>);
}

/* ajakan / status izin notifikasi; ringkas = di dalam panel lonceng */
export function KartuIzinNotif({ ringkas, nilai }: { ringkas?: boolean; nilai?: NilaiNotif }) {
  const dariKonteks = useNotif(), n = nilai ?? dariKonteks;
  const { toast, galat } = useAplikasi();
  const [proses, setProses] = useState(false);
  if (!n?.status) return null;
  const st = n.status;
  const aktifkan = async () => {
    setProses(true);
    try {
      const h = await aktifkanNotif();
      if (h === 'aktif' || h === 'izin-saja') toast('Notifikasi aktif di perangkat ini');
      else if (h === 'denied') toast('Izin notifikasi ditolak. Izinkan lewat ikon gembok di samping alamat situs.', true);
      n.cekStatus();
    } catch (e) { galat(e); } finally { setProses(false); }
  };
  if (ringkas && (st === 'aktif' || st === 'izin-saja' || st === 'tidak-didukung')) return null;
  if (st === 'aktif' || st === 'izin-saja') return <div className="note nf-izin ok"><Ikon n="circle-check" /><div><b>Notifikasi aktif di perangkat ini.</b>
    <div className="tiny muted">Pengingat clock in/out 5 menit sebelum jadwal, kabar persetujuan, pengumuman, dan slip gaji akan muncul di sini.</div></div></div>;
  if (st === 'denied') return <div className="warn nf-izin"><Ikon n="circle-alert" /><div><b>Notifikasi diblokir di browser ini.</b>
    <div className="tiny">Klik ikon gembok / pengaturan situs di samping alamat, ubah <b>Notifikasi</b> menjadi <b>Izinkan</b>, lalu muat ulang halaman.</div></div></div>;
  if (st === 'perlu-https') return <div className="warn nf-izin"><Ikon n="circle-alert" /><div><b>Notifikasi memerlukan alamat HTTPS.</b>
    <div className="tiny">Buka aplikasi lewat https:// (atau localhost saat pengujian).</div></div></div>;
  if (st === 'tidak-didukung') return <div className="note nf-izin"><Ikon n="info" /><div><b>Browser ini belum mendukung notifikasi.</b>
    <div className="tiny muted">Di iPhone/iPad: buka di Safari, ketuk Bagikan → <b>Tambah ke Layar Utama</b>, lalu buka aplikasi dari ikon tersebut. Notifikasi tetap tampil di lonceng aplikasi.</div></div></div>;
  return (
    <div className="nf-ajak">
      <span className="nf-ajak-ic"><Ikon n="bell" /></span>
      <div style={{ flex: 1, minWidth: 0 }}><b>Aktifkan notifikasi</b>
        <div className="tiny muted">Dapatkan pengingat clock in/out 5 menit sebelum jadwal dan kabar persetujuan, walau aplikasi tertutup.</div></div>
      <button className="btn sm auto" disabled={proses} onClick={aktifkan}><Ikon n="bell" />{proses ? 'Memproses…' : 'Aktifkan'}</button>
    </div>
  );
}

/* banner di atas konten selama izin belum diberikan; bisa ditutup untuk sesi ini */
export function BannerNotif() {
  const n = useNotif();
  const [tutup, setTutup] = useState(true);
  useEffect(() => { try { setTutup(sessionStorage.getItem('posi.notif.tutup') === '1'); } catch { setTutup(false); } }, []);
  if (!n || n.status !== 'default' || tutup) return null;
  return (
    <div className="nf-banner">
      <KartuIzinNotif />
      <button type="button" className="nf-tutup" aria-label="Tutup ajakan notifikasi" onClick={() => { setTutup(true); try { sessionStorage.setItem('posi.notif.tutup', '1'); } catch { /* */ } }}><Ikon n="x" /></button>
    </div>
  );
}

/* pengaturan notifikasi di halaman Profil */
export function PengaturanNotif() {
  const n = useNotif();
  const { toast, galat } = useAplikasi();
  if (!n) return null;
  const uji = () => api<{ pesan: string }>('notif_uji', {}).then((r) => { toast(r.pesan); setTimeout(n.muat, 800); }).catch(galat);
  const matikan = () => matikanNotif().then(() => { toast('Notifikasi dimatikan di perangkat ini'); n.cekStatus(); }).catch(galat);
  return (
    <div className="card"><h3><Ikon n="bell" />Notifikasi</h3>
      <KartuIzinNotif />
      <div className="tiny muted" style={{ margin: '10px 0' }}>Yang dikirim: pengingat <b>clock in</b> & <b>clock out</b> 5 menit sebelum jadwal (tidak dikirim saat libur, cuti, atau izin),
        hasil persetujuan cuti/izin/lembur/lupa absen/izin terlambat, approval & koreksi absensi, pengajuan baru untuk atasan, pengumuman, dan slip gaji terbit.</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm auto" onClick={uji}><Ikon n="send" />Kirim notifikasi uji</button>
        {n.status === 'aktif' && <button className="btn ghost sm auto" onClick={matikan}><Ikon n="x" />Matikan di perangkat ini</button>}
      </div>
    </div>
  );
}
