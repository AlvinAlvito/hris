'use client';
/* Pemilih titik di peta (Leaflet + OpenStreetMap), dengan lingkaran radius.
   tipeRadius 'dalam' = area absen kantor; 'luar' = jarak minimum dari titik awal (mode lapangan). */
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';

interface Props {
  judul: string; lat?: number | null; lng?: number | null; radius?: number; tipeRadius?: 'dalam' | 'luar';
  simpan: (lat: number, lng: number) => void; batal?: () => void;
}
const PUSAT_BAWAAN: [number, number] = [-6.2, 106.8166];   // Jakarta

export function PilihPeta({ judul, lat, lng, radius = 200, tipeRadius = 'dalam', simpan, batal }: Props) {
  const { toast, tutupSheet } = useAplikasi();
  const kotak = useRef<HTMLDivElement>(null);
  const peta = useRef<any>(null);
  const penanda = useRef<any>(null), lingkar = useRef<any>(null);
  const [titik, setTitik] = useState<[number, number] | null>(lat != null && lng != null ? [lat, lng] : null);
  const [manual, setManual] = useState(lat != null ? `${lat}, ${lng}` : '');

  useEffect(() => {
    let hidup = true;
    import('leaflet').then((L) => {
      if (!hidup || !kotak.current || peta.current) return;
      const m = L.map(kotak.current).setView(titik ?? PUSAT_BAWAAN, titik ? 16 : 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      peta.current = { L, m };
      m.on('click', (e: any) => setTitik([e.latlng.lat, e.latlng.lng]));
      setTimeout(() => m.invalidateSize(), 120);
    });
    return () => { hidup = false; peta.current?.m.remove(); peta.current = null; };
    // peta dibuat sekali saat dibuka
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const p = peta.current; if (!p || !titik) return;
    const { L, m } = p;
    const ikon = L.divIcon({ className: '', html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#1b4f94;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>', iconSize: [22, 22], iconAnchor: [11, 22] });
    if (!penanda.current) {
      penanda.current = L.marker(titik, { draggable: true, icon: ikon }).addTo(m);
      penanda.current.on('dragend', () => { const ll = penanda.current.getLatLng(); setTitik([ll.lat, ll.lng]); });
    } else penanda.current.setLatLng(titik);
    if (!lingkar.current) lingkar.current = L.circle(titik, { radius, color: tipeRadius === 'dalam' ? '#3aa0e6' : '#e03a3a', fillOpacity: 0.12, weight: 2, dashArray: tipeRadius === 'luar' ? '6 6' : undefined }).addTo(m);
    else lingkar.current.setLatLng(titik).setRadius(radius);
    setManual(`${titik[0].toFixed(6)}, ${titik[1].toFixed(6)}`);
  }, [titik, radius, tipeRadius]);

  const lokasiSaya = () => {
    if (!navigator.geolocation) { toast('GPS tidak didukung', true); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const t: [number, number] = [p.coords.latitude, p.coords.longitude];
      setTitik(t); peta.current?.m.setView(t, 17);
    }, () => toast('Lokasi tidak diizinkan', true), { enableHighAccuracy: true, timeout: 15000 });
  };
  const pakaiManual = () => {
    const m = manual.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) { toast('Format: -6.2000, 106.8166', true); return; }
    const t: [number, number] = [+m[1], +m[2]];
    if (Math.abs(t[0]) > 90 || Math.abs(t[1]) > 180) { toast('Koordinat di luar jangkauan', true); return; }
    setTitik(t); peta.current?.m.setView(t, 17);
  };
  return (
    <>
      <h3><Ikon n="map-pin" />{judul}</h3>
      <div className="tiny muted">Ketuk peta atau geser penanda. {tipeRadius === 'dalam' ? `Lingkaran = area absen (${radius} m).` : `Lingkaran merah = jarak minimum (${(radius / 1000).toFixed(1)} km).`}</div>
      <div ref={kotak} id="mapBox" />
      <div className="row" style={{ marginTop: 10 }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="atau ketik: -6.2000, 106.8166" />
        <button className="btn ghost sm auto" onClick={pakaiManual}>Pakai</button>
      </div>
      <button className="btn ghost" onClick={lokasiSaya}><Ikon n="map-pin" />Pakai Lokasi Saya</button>
      <button className="btn" disabled={!titik} onClick={() => titik && simpan(titik[0], titik[1])}><Ikon n="check" />Simpan Titik</button>
      <button className="btn ghost" onClick={() => (batal ? batal() : tutupSheet())}>Batal</button>
    </>
  );
}
