'use client';
/* Form aset barang yang dipegang karyawan — dipakai di "Aset Saya" (karyawan) dan menu Aset → Aset Karyawan (HC). */
import { useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { todayStr } from '@/lib/klien/format';

export type AsetBarang = { id: number; userId: number | null; nama: string; nik: string; divisi: string; jenis: string; tipe: string; nomorSeri: string; sejak: string | null;
  kondisi: 'baik' | 'perlu_perbaikan' | 'rusak'; keterangan: string; status: 'dipegang' | 'dikembalikan'; tglKembali: string | null; diverifikasi: boolean;
  verifikasiOleh: string; verifikasiAt: string | null; dibuatNama: string; diubah: string };
export const LABEL_KONDISI: Record<string, string> = { baik: 'Baik', perlu_perbaikan: 'Perlu perbaikan', rusak: 'Rusak' };
export const WARNA_KONDISI: Record<string, string> = { baik: 'b-green', perlu_perbaikan: 'b-amber', rusak: 'b-red' };

export function FormAset({ a, jenis, karyawan, selesai }: { a: AsetBarang | null; jenis: string[]; karyawan?: { id: number; nama: string; divisi?: string }[]; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [v, setV] = useState({ userId: a?.userId ? String(a.userId) : '', jenis: a?.jenis ?? '', tipe: a?.tipe ?? '', nomorSeri: a?.nomorSeri ?? '', sejak: a?.sejak ?? '',
    kondisi: a?.kondisi ?? 'baik', keterangan: a?.keterangan ?? '' });
  const [kirim, setKirim] = useState(false);
  const set = (f: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [f]: e.target.value }));
  const simpan = () => {
    if (karyawan && !v.userId) { toast('Pilih karyawan pemegang aset', true); return; }
    setKirim(true);
    api<{ pesan: string }>('asb_simpan', { id: a?.id ?? 0, ...v, userId: Number(v.userId) || 0 }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); })
      .catch((e) => { galat(e); setKirim(false); });
  };
  return (<>
    <h3><Ikon n="briefcase" />{a ? 'Ubah' : 'Tambah'} Aset</h3>
    {karyawan && <><label style={{ marginTop: 0 }}>Karyawan pemegang *</label>
      <select value={v.userId} onChange={set('userId')}><option value="">— pilih karyawan —</option>
        {karyawan.map((k) => <option key={k.id} value={k.id}>{k.nama}{k.divisi ? ` · ${k.divisi}` : ''}</option>)}</select></>}
    <label style={karyawan ? undefined : { marginTop: 0 }}>Jenis aset *</label>
    <input list="daftar-jenis-aset" value={v.jenis} onChange={set('jenis')} placeholder="mis. Laptop" maxLength={60} />
    <datalist id="daftar-jenis-aset">{jenis.map((j) => <option key={j} value={j} />)}</datalist>
    <label>Merk / tipe *</label><input value={v.tipe} onChange={set('tipe')} placeholder="mis. Lenovo ThinkPad E14 / Samsung Galaxy A15" maxLength={150} />
    <div className="row">
      <div><label>Dipegang sejak *</label><input type="date" value={v.sejak ?? ''} max={todayStr()} onChange={set('sejak')} /></div>
      <div><label>Kondisi</label><select value={v.kondisi} onChange={set('kondisi')}>{Object.entries(LABEL_KONDISI).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
    </div>
    <label>Nomor seri / kode inventaris <span className="tiny muted">(opsional)</span></label>
    <input value={v.nomorSeri} onChange={set('nomorSeri')} placeholder="mis. SN PF3XK2AB / INV-IT-014" maxLength={100} />
    <label>Keterangan <span className="tiny muted">(opsional)</span></label>
    <input value={v.keterangan} onChange={set('keterangan')} placeholder="mis. termasuk charger & tas laptop" maxLength={500} />
    {!karyawan && <div className="tiny muted" style={{ marginTop: 8 }}>Data aset akan diperiksa dan diverifikasi oleh HC.</div>}
    <button className="btn" style={{ marginTop: 14 }} disabled={kirim} onClick={simpan}><Ikon n="check" />Simpan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

/* konfirmasi pengembalian aset (tanggal bisa diubah) */
export function FormKembali({ a, selesai }: { a: AsetBarang; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const [tgl, setTgl] = useState(todayStr()), [kirim, setKirim] = useState(false);
  const simpan = () => {
    setKirim(true);
    api<{ pesan: string }>('asb_kembalikan', { id: a.id, tanggal: tgl }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch((e) => { galat(e); setKirim(false); });
  };
  return (<>
    <h3><Ikon n="undo-2" />Aset dikembalikan</h3>
    <p style={{ marginTop: 0 }}><b>{a.jenis}</b> · {a.tipe}{a.nama && <> — dipegang {a.nama}</>}</p>
    <label>Tanggal dikembalikan</label><input type="date" value={tgl} min={a.sejak ?? undefined} max={todayStr()} onChange={(e) => setTgl(e.target.value)} />
    <div className="tiny muted" style={{ marginTop: 6 }}>Data tetap tersimpan sebagai riwayat.</div>
    <button className="btn" style={{ marginTop: 14 }} disabled={kirim} onClick={simpan}><Ikon n="check" />Tandai dikembalikan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}
