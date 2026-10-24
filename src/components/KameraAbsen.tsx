'use client';
/* Absen masuk / pulang: kamera dengan panduan wajah, GPS, cap foto (waktu, alamat, koordinat) */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/klien/api';
import { jamStr, jarakMeter, km, pad, tglIndo, todayStr } from '@/lib/klien/format';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';

interface Posisi { lat: number; lng: number; acc: number }
interface Props { mode: 'in' | 'out'; izin: { kerjaDari: string; sesi: string }; selesai: () => void }

let emblem: HTMLImageElement | null = null;
function ambilEmblem() {
  if (!emblem && typeof Image !== 'undefined') { emblem = new Image(); emblem.src = '/emblem-posi.png'; }
  return emblem;
}
function barisTeks(cx: CanvasRenderingContext2D, teks: string, lebar: number) {
  const baris: string[] = []; let cur = '';
  for (const k of teks.split(' ')) { const c = cur ? cur + ' ' + k : k; if (cx.measureText(c).width > lebar && cur) { baris.push(cur); cur = k; } else cur = c; }
  if (cur) baris.push(cur);
  return baris.slice(0, 2);
}

export function KameraAbsen({ mode, izin, selesai }: Props) {
  const { me, settings, tutupSheet, toast, galat } = useAplikasi();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<HTMLCanvasElement | null>(null);
  const waktu = useRef<Date>(new Date());
  const [kamera, setKamera] = useState<'menyala' | 'aktif' | 'gagal' | 'tidak ada'>('menyala');
  const [foto, setFoto] = useState('');
  const [pos, setPos] = useState<Posisi | null>(null);
  const [alamat, setAlamat] = useState('');
  const [lokasi, setLokasi] = useState<{ boleh: boolean; kelas: string; pesan: string; alasan: string }>({ boleh: false, kelas: 'wait', pesan: 'Mencari lokasi…', alasan: 'Menunggu lokasi…' });
  const [kirim, setKirim] = useState(false);
  const judul = mode === 'in' ? 'Clock In' : 'Clock Out';

  const matikan = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);
  const nyalakan = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setKamera('tidak ada'); return; }
    setKamera('menyala');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false })
      .then((st) => { stream.current = st; setKamera('aktif'); })
      .catch(() => setKamera('gagal'));
  }, []);
  useEffect(() => { if (kamera === 'aktif' && video.current && stream.current) { video.current.srcObject = stream.current; video.current.play().catch(() => {}); } }, [kamera]);
  useEffect(() => { ambilEmblem(); nyalakan(); return matikan; }, [nyalakan, matikan]);

  /* GPS + alamat */
  useEffect(() => {
    if (!navigator.geolocation) { setLokasi({ boleh: false, kelas: 'bad', pesan: 'GPS tidak didukung perangkat ini', alasan: 'GPS tidak didukung' }); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const ps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
      setPos(ps);
      fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=id&lat=${ps.lat}&lon=${ps.lng}`)
        .then((r) => r.json())
        .then((j) => {
          const a = j.address || {};
          const bag = [a.road, a.village || a.suburb || a.neighbourhood, a.city_district, a.city || a.town || a.county || a.regency, a.state]
            .filter((x: string, i: number, arr: string[]) => x && arr.indexOf(x) === i);
          setAlamat(bag.length ? bag.join(', ') : j.display_name || 'Alamat tidak ditemukan');
        })
        .catch(() => setAlamat('Alamat tidak ditemukan'));
    }, () => setLokasi({ boleh: false, kelas: 'bad', pesan: 'Lokasi tidak diizinkan. Aktifkan GPS lalu buka ulang halaman absen.', alasan: 'Lokasi tidak aktif' }),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }, []);

  /* boleh absen di lokasi ini? (server tetap memeriksa ulang) */
  useEffect(() => {
    if (!pos || !me) return;
    const acc = ` (±${pos.acc}m)`;
    if (izin.kerjaDari) {
      setLokasi({ boleh: true, kelas: 'ok', alasan: '', pesan: `${izin.kerjaDari === 'wfh' ? 'WFH' : 'Dinas luar kota'} disetujui HC — absen tanpa batas area. Lokasi tetap direkam${acc}.` });
    } else if (me.lokasiMode === 'lapangan') {
      const d = jarakMeter(pos.lat, pos.lng, me.baseLat, me.baseLng), min = (+me.minJarakKm || 2.5) * 1000;
      setLokasi(d >= min
        ? { boleh: true, kelas: 'ok', alasan: '', pesan: `Boleh absen. Jarak dari titik awal (${me.baseLabel || '-'}): ${km(d)}${acc}` }
        : { boleh: false, kelas: 'bad', alasan: 'baru ' + km(d) + ' dari titik awal', pesan: `Belum bisa absen: baru ${km(d)} dari titik awal. Minimal ${km(min)}.` });
    } else if (me.lokasiMode === 'kantor') {
      const oLat = me.cabangLat ?? settings.officeLat, oLng = me.cabangLat != null ? me.cabangLng : settings.officeLng;
      const rad = me.cabangLat != null ? me.cabangRadius || 200 : settings.radius, nama = me.cabangNama || 'kantor';
      // sama dengan aturan server: lokasi kerja tanpa titik peta (dan tanpa titik global) belum bisa dipakai absen
      if (oLat == null && me.cabangNama) setLokasi({ boleh: false, kelas: 'bad', alasan: 'titik lokasi belum diatur', pesan: `Titik lokasi ${nama} belum ditetapkan HC di peta. Hubungi HC.` });
      else if (oLat == null) setLokasi({ boleh: true, kelas: 'wait', alasan: '', pesan: `Titik kantor belum diatur HC. Lokasi tetap direkam${acc}.` });
      else {
        const d = jarakMeter(pos.lat, pos.lng, oLat, oLng);
        if (d <= rad) setLokasi({ boleh: true, kelas: 'ok', alasan: '', pesan: `Di dalam area ${nama} · ${d} m dari titik lokasi${acc}` });
        else setLokasi({ boleh: true, kelas: 'wait', alasan: '', pesan: `Peringatan: di luar area ${nama} (${km(d)} dari lokasi, batas ${rad} m). Absensi tetap dapat dikirim dan akan ditandai untuk HC.` });
      }
    } else setLokasi({ boleh: true, kelas: 'ok', alasan: '', pesan: `Mode bebas — lokasi direkam${acc}.` });
  }, [pos, me, settings, izin]);

  /* cap foto ringkas di bagian bawah; ukuran mengikuti lebar foto */
  const cap = useCallback(() => {
    const fr = frame.current; if (!fr || !me) return;
    const w = fr.width, h = fr.height, cv = document.createElement('canvas'), cx = cv.getContext('2d')!, d = waktu.current;
    cv.width = w; cv.height = h; cx.drawImage(fr, 0, 0);
    const k = w / 600, f = (b: number, px: number) => `${b} ${Math.round(px * k)}px "Jakarta",-apple-system,"Segoe UI",Roboto,Arial,sans-serif`;
    const pd = Math.round(18 * k), lebar = w - pd * 2;
    cx.font = f(500, 13);
    const baris = barisTeks(cx, pos ? alamat || 'Mencari alamat…' : 'Lokasi belum terbaca', lebar);
    const tinggi = Math.round((128 + baris.length * 18) * k);
    const g = cx.createLinearGradient(0, h - tinggi - 40 * k, 0, h);
    g.addColorStop(0, 'rgba(6,17,31,0)'); g.addColorStop(0.35, 'rgba(6,17,31,.62)'); g.addColorStop(1, 'rgba(6,17,31,.86)');
    cx.fillStyle = g; cx.fillRect(0, h - tinggi - 40 * k, w, tinggi + 40 * k);
    const label = (mode === 'in' ? 'ABSEN MASUK' : 'ABSEN PULANG') + (izin.kerjaDari ? ' · ' + (izin.kerjaDari === 'wfh' ? 'WFH' : 'DINAS LUAR KOTA') : '');
    cx.font = f(800, 12); const lw = cx.measureText(label).width + 22 * k, lh = 26 * k;
    cx.fillStyle = mode === 'in' ? '#3aa0e6' : '#0e2a55'; cx.beginPath();
    if (cx.roundRect) cx.roundRect(pd, pd, lw, lh, lh / 2); else cx.rect(pd, pd, lw, lh);
    cx.fill(); cx.fillStyle = '#fff'; cx.fillText(label, pd + 11 * k, pd + 17.5 * k);
    const em = ambilEmblem(); if (em?.complete && em.naturalWidth) cx.drawImage(em, w - pd - 38 * k, pd - 4 * k, 38 * k, 38 * k);
    let y = h - tinggi + 30 * k; const jam = pad(d.getHours()) + ':' + pad(d.getMinutes());
    cx.fillStyle = '#fff'; cx.font = f(800, 32); cx.fillText(jam, pd, y);
    const jw = cx.measureText(jam).width;
    cx.font = f(700, 13); cx.fillStyle = '#8cccf4'; cx.fillText(':' + pad(d.getSeconds()) + ' WIB', pd + jw + 5 * k, y);
    y += 21 * k; cx.fillStyle = '#fff'; cx.font = f(600, 14); cx.fillText(tglIndo(todayStr(d)), pd, y);
    y += 18 * k; cx.font = f(500, 13); cx.fillStyle = 'rgba(255,255,255,.85)'; cx.fillText(me.nama + ' · ' + me.nik, pd, y);
    y += 8 * k; cx.fillStyle = '#3aa0e6'; cx.fillRect(pd, y, 30 * k, 2 * k);
    cx.font = f(500, 13); cx.fillStyle = '#fff';
    for (const b of baris) { y += 18 * k; cx.fillText(b, pd, y); }
    y += 18 * k; cx.font = f(600, 12); cx.fillStyle = '#8cccf4';
    cx.fillText(pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}  ·  akurasi ±${pos.acc} m` : 'Koordinat tidak tersedia', pd, y);
    setFoto(cv.toDataURL('image/jpeg', 0.75));
  }, [me, pos, alamat, mode, izin]);
  // cap digambar ulang saat GPS / alamat baru terbaca setelah foto diambil
  useEffect(() => { if (frame.current) cap(); }, [cap]);

  const jepret = () => {
    const v = video.current; if (!v || !v.videoWidth) { toast('Kamera belum siap'); return; }
    // ambil bagian tengah 3:4, sama dengan yang terlihat di pratinjau & oval panduan
    const vw = v.videoWidth, vh = v.videoHeight; let sw = vw, sh = vh;
    if (vw / vh > 3 / 4) sw = Math.round(vh * 3 / 4); else sh = Math.round(vw * 4 / 3);
    const fr = document.createElement('canvas'); fr.width = 600; fr.height = 800;
    const fx = fr.getContext('2d')!; fx.translate(600, 0); fx.scale(-1, 1); fx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, 600, 800);
    frame.current = fr; waktu.current = new Date(); matikan(); setKamera('menyala');
    cap();
  };
  const ulang = () => { frame.current = null; setFoto(''); nyalakan(); };
  const simpan = async () => {
    if (settings.wajibFoto && !foto) { toast('Foto wajib diambil dari kamera', true); return; }
    if (!pos) { toast('Lokasi belum didapat', true); return; }
    setKirim(true);
    try {
      const d = await api<{ pesan: string }>('absen', { mode, photo: foto, lat: pos.lat, lng: pos.lng });
      tutupSheet(); toast(d.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  const siap = (!settings.wajibFoto || !!foto) && lokasi.boleh;

  return (
    <div className="kamera-absen">
      <h3 suppressHydrationWarning>{judul} — {jamStr()}</h3>
      <div className="muted small" style={{ marginBottom: 10 }}>{tglIndo(todayStr())}</div>
      <div className="camwrap">
        {foto ? <img src={foto} alt="hasil foto" />
          : kamera === 'aktif' ? (
            <>
              <video ref={video} autoPlay playsInline muted />
              <div className="pandu-wajah"><div className="oval" /><div className="teks"><Ikon n="user" />Posisikan wajah di dalam garis</div></div>
            </>
          ) : kamera === 'gagal' ? (
            <div className="camhint">Kamera tidak dapat diakses.<br /><span className="tiny">Izinkan akses kamera pada browser Anda.</span><br />
              <button className="btn sm ghost auto" style={{ marginTop: 10 }} onClick={nyalakan}>Coba Lagi</button></div>
          ) : kamera === 'tidak ada' ? (
            <div className="camhint">Kamera tidak tersedia di browser ini.<br /><span className="tiny">Buka aplikasi melalui alamat https://</span></div>
          ) : <div className="camhint">Menyalakan kamera…</div>}
      </div>
      <div className="tiny muted center" style={{ marginTop: 6 }}>Foto diambil langsung dari kamera.</div>
      <div className="geo"><span className={'dot ' + lokasi.kelas} /><span>{lokasi.pesan}</span></div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn ghost sm" onClick={tutupSheet}>Batal</button>
        <button className="btn sm" onClick={foto ? ulang : jepret}>{foto ? 'Ambil Ulang' : 'Ambil Foto'}</button>
      </div>
      <button className={'btn ' + (mode === 'in' ? 'green' : 'red')} disabled={!siap || kirim} onClick={simpan}>
        {kirim ? <><span className="spin" /> Mengirim…</> : !lokasi.boleh ? 'Terkunci — ' + lokasi.alasan : 'Simpan ' + judul}
      </button>
    </div>
  );
}
