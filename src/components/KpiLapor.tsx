'use client';
/* Lembar KPI & KBI bulanan. Diisi atasan / HC (mode "verifikator"), diverifikasi atasan; karyawan hanya melihat (mode "karyawan"). */
import { useState } from 'react';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { NAMA_BULAN, rupiah } from '@/lib/klien/format';

export type NilaiKpi = { id: number; jenis: 'kpi' | 'kbi'; kelompok: string; nama: string; deskripsi: string; satuan: string; target: number; bobot: number; arah: string; sumber: string;
  sumberLabel: string; realisasi: number | null; bukti: string; keterangan: string; pencapaian: number | null };
export type LaporKpi = { id: number; userId: number; nama: string; nik: string; jabatan: string; dept: string; periode: string; template: string; status: string; statusLabel: string;
  skor: number | null; predikat: string; lengkap: boolean; catatan: string; catatanVerifikator: string; diajukan: string | null; diverifikasiOleh: string; diverifikasi: string | null;
  skorKbi: number | null; insentif: number | null; skorTetap: boolean; sumberData: string; nilai: NilaiKpi[] };
export type RiwayatKpi = { periode: string; skor: number | null; predikat: string; status: string };

export const bulanTeks = (p: string) => `${NAMA_BULAN[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;
export function daftarPeriode(n = 12): string[] {
  const d = new Date(), l: string[] = [];
  for (let i = 0; i < n; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); l.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); }
  return l;
}
export const kelasPredikat = (s: number | null) => (s == null ? '' : s >= 100 ? 'hijau' : s >= 90 ? 'biru' : s >= 75 ? 'kuning' : 'merah');
export const WARNA_STATUS: Record<string, string> = { draf: 'b-gray', diajukan: 'b-amber', disetujui: 'b-green', dikembalikan: 'b-red', belum: 'b-gray', tanpa: 'b-gray' };
const angka = (v: number | null, satuan = '') => (v == null ? '—' : `${Number.isInteger(v) ? v : v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}${satuan ? ' ' + satuan : ''}`);
const persen = (v: number | null) => (v == null ? '—' : v.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%');

export function SkorKpi({ skor, predikat, besar, label }: { skor: number | null; predikat?: string; besar?: boolean; label?: string }) {
  if (skor == null) return <span className={'kp-skor kosong' + (besar ? ' besar' : '')}><b>—</b>{besar && <small>{label ? label + ' · ' : ''}belum diisi</small>}</span>;
  return <span className={'kp-skor ' + kelasPredikat(skor) + (besar ? ' besar' : '')}><b>{skor.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</b>
    {besar && <small>{label ? label : ''}{label && predikat ? ' · ' : ''}{predikat}</small>}</span>;
}

/* grafik batang skor KPI 12 bulan terakhir (terlama di kiri) */
export function GrafikRiwayat({ riwayat, pilih }: { riwayat: RiwayatKpi[]; pilih?: (p: string) => void }) {
  const data = [...riwayat].reverse();
  if (!data.length) return <div className="empty tiny">Belum ada riwayat KPI.</div>;
  return (
    <div className="kp-grafik">{data.map((r) => (
      <button key={r.periode} type="button" className="kp-batang" onClick={() => pilih?.(r.periode)} title={`${bulanTeks(r.periode)}: ${r.skor ?? '-'} ${r.predikat}`}>
        <span className="kp-nilai">{r.skor == null ? '–' : Math.round(r.skor)}</span>
        <span className="kp-tiang"><i className={kelasPredikat(r.skor) + (r.status !== 'disetujui' ? ' sementara' : '')} style={{ height: Math.min(100, r.skor ?? 0) + '%' }} /></span>
        <span className="kp-bulan">{NAMA_BULAN[+r.periode.slice(5, 7) - 1].slice(0, 3)}</span>
      </button>))}
    </div>
  );
}

/* mode "verifikator" = atasan / HC yang mengisi; bolehSetujui = atasan penilai (boleh menyetujui & mengembalikan) */
export function LembarKpi({ lapor, mode, admin, bolehSetujui, segarkan }: { lapor: LaporKpi; mode: 'karyawan' | 'verifikator'; admin?: boolean; bolehSetujui?: boolean; segarkan: () => void }) {
  const { toast, galat, tanya, yakin } = useAplikasi();
  const final = lapor.status === 'disetujui';
  const bolehIsi = mode === 'verifikator' && !final && !(lapor.status === 'diajukan' && !bolehSetujui);
  const [isi, setIsi] = useState<Record<number, Partial<NilaiKpi>>>({});
  const [catatan, setCatatan] = useState(mode === 'verifikator' ? lapor.catatan : '');
  const [kirim, setKirim] = useState(false);
  const ubah = (id: number, k: keyof NilaiKpi, v: unknown) => setIsi((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));
  const nilai = (x: NilaiKpi, k: keyof NilaiKpi) => (isi[x.id]?.[k] !== undefined ? isi[x.id]![k] : x[k]) as never;
  const kumpul = () => Object.entries(isi).map(([id, v]) => ({ id: +id, ...v }));
  const kpi = lapor.nilai.filter((x) => x.jenis !== 'kbi'), kbi = lapor.nilai.filter((x) => x.jenis === 'kbi');

  const jalankan = async (aksi: string, data: Record<string, unknown>) => {
    setKirim(true);
    try { const r = await api<{ pesan: string }>(aksi, data); toast(r.pesan); setIsi({}); segarkan(); } catch (e) { galat(e); } finally { setKirim(false); }
  };
  const putus = async (keputusan: 'simpan' | 'ajukan' | 'setujui' | 'kembalikan') => {
    let c = catatan;
    if (keputusan === 'kembalikan') {
      const t = await tanya('Apa yang perlu diperbaiki?', '', { judul: 'Kembalikan KPI', panjang: true, wajib: true });
      if (t === null) return; c = t;
    }
    if (keputusan === 'ajukan' && !(await yakin(`Ajukan KPI ${lapor.nama}?`, 'Atasan akan memverifikasi isian KPI & KBI ini.', { ya: 'Ajukan' }))) return;
    if (keputusan === 'setujui' && !(await yakin(`Setujui KPI ${lapor.nama}?`, 'Skor KPI & KBI bulan ini menjadi final dan karyawan mendapat notifikasi.', { ya: 'Setujui' }))) return;
    jalankan('kpi_verifikasi', { id: lapor.id, nilai: kumpul(), catatan: c, keputusan });
  };
  const buka = async () => {
    const a = await tanya('Alasan membuka kembali (wajib):', '', { judul: 'Buka kembali KPI', panjang: true, wajib: true });
    if (a !== null) jalankan('kpi_buka', { id: lapor.id, alasan: a });
  };

  const barisKpi = (x: NilaiKpi) => {
    const oto = x.sumber !== 'manual', r = nilai(x, 'realisasi') as number | null, t = nilai(x, 'target') as number;
    return (
      <div key={x.id} className="kp-ind">
        <div className="kp-ind-atas">
          <div style={{ minWidth: 0 }}><b>{x.nama}</b>{x.deskripsi && <div className="tiny muted">{x.deskripsi}</div>}</div>
          <span className="kp-bobot">Bobot {x.bobot}%</span>
        </div>
        <div className="kp-ind-isi">
          <div><span className="tiny muted">Target</span>
            {bolehIsi && !oto && x.arah !== 'ya_tidak'
              ? <input type="number" min={0} step="any" value={t ?? ''} onChange={(e) => ubah(x.id, 'target', e.target.value)} />
              : <b>{x.arah === 'ya_tidak' ? 'Ya' : angka(x.target, x.satuan)}{x.arah === 'turun' && <span className="tiny muted"> (maks.)</span>}</b>}</div>
          <div><span className="tiny muted">Realisasi</span>
            {oto ? <b title={x.sumberLabel}>{x.realisasi == null ? <span className="tiny muted">tidak ada data</span> : angka(x.realisasi, x.satuan)} <span className="badge b-blue kp-oto"><Ikon n="sparkles" />otomatis</span></b>
              : bolehIsi ? (x.arah === 'ya_tidak'
                ? <select value={r == null ? '' : String(r)} onChange={(e) => ubah(x.id, 'realisasi', e.target.value)}><option value="">— pilih —</option><option value="1">Ya, tercapai</option><option value="0">Tidak</option></select>
                : <input type="number" min={0} step="any" inputMode="decimal" placeholder={'dalam ' + (x.satuan || 'angka')} value={r ?? ''} onChange={(e) => ubah(x.id, 'realisasi', e.target.value)} />)
                : <b>{x.arah === 'ya_tidak' ? (x.realisasi == null ? '—' : x.realisasi >= 1 ? 'Ya' : 'Tidak') : angka(x.realisasi, x.satuan)}</b>}</div>
          <div className="kp-capai"><span className="tiny muted">Pencapaian</span><b className={kelasPredikat(x.pencapaian)}>{persen(x.pencapaian)}</b></div>
        </div>
        <div className="bar kp-bar"><i className={kelasPredikat(x.pencapaian)} style={{ width: Math.min(100, x.pencapaian ?? 0) + '%' }} /></div>
        {!oto && (bolehIsi ? (
          <div className="row kp-bukti">
            <input placeholder="Tautan bukti (opsional) — Drive, foto, laporan" value={nilai(x, 'bukti') ?? ''} onChange={(e) => ubah(x.id, 'bukti', e.target.value)} />
            <input placeholder="Keterangan (opsional)" value={nilai(x, 'keterangan') ?? ''} onChange={(e) => ubah(x.id, 'keterangan', e.target.value)} />
          </div>) : (x.bukti || x.keterangan) && (
          <div className="tiny kp-info">{x.bukti && <a href={x.bukti} target="_blank" rel="noreferrer noopener"><Ikon n="external-link" />Lihat bukti</a>}{x.keterangan && <span>{x.keterangan}</span>}</div>))}
        {oto && <div className="tiny muted">{x.sumberLabel} — dihitung dari {['kehadiran', 'tepat_waktu'].includes(x.sumber) ? 'data absensi' : 'menu Pekerjaan Saya'}{final ? ' (dikunci saat disetujui)' : ''}.
          {x.realisasi == null && ' Belum ada data bulan ini, sehingga tidak ikut dihitung dan bobotnya terbagi ke indikator lain.'}</div>}
      </div>);
  };
  const barisKbi = (x: NilaiKpi) => {
    const r = nilai(x, 'realisasi') as number | null, t = nilai(x, 'target') as number;
    return (
      <div key={x.id} className="kp-ind">
        <div className="kp-ind-atas"><div style={{ minWidth: 0 }}><b>{x.kelompok || x.nama}</b><div className="tiny muted">{x.kelompok ? x.nama : x.deskripsi}</div></div></div>
        <div className="kp-ind-isi">
          <div><span className="tiny muted">Skor target</span>
            {bolehIsi ? <select value={String(t ?? '')} onChange={(e) => ubah(x.id, 'target', e.target.value)}>{[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}</select> : <b>{angka(x.target)}</b>}</div>
          <div><span className="tiny muted">Skor realisasi (1–5)</span>
            {bolehIsi ? <select value={r == null ? '' : String(r)} onChange={(e) => ubah(x.id, 'realisasi', e.target.value)}><option value="">— nilai —</option>
              {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}</select> : <b>{angka(x.realisasi)}</b>}</div>
          <div className="kp-capai"><span className="tiny muted">Capaian</span><b className={kelasPredikat(x.pencapaian)}>{persen(x.pencapaian)}</b></div>
        </div>
      </div>);
  };
  // KPI dikelompokkan per Objectives
  const grupKpi: [string, NilaiKpi[]][] = [];
  for (const x of kpi) { const g = grupKpi.find(([k]) => k === x.kelompok); if (g) g[1].push(x); else grupKpi.push([x.kelompok, [x]]); }

  return (<div className="kp-lembar">
    <div className="kp-kepala">
      <div style={{ minWidth: 0 }}>
        <div className="tiny muted">{bulanTeks(lapor.periode)} · {lapor.template}</div>
        {mode === 'verifikator' && <h3 style={{ margin: '2px 0 0' }}>{lapor.nama}</h3>}
        {mode === 'verifikator' && <div className="tiny muted">{lapor.jabatan}{lapor.dept ? ' · ' + lapor.dept : ''} · {lapor.nik}</div>}
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={'badge ' + WARNA_STATUS[lapor.status]}>{lapor.statusLabel}</span>
          {lapor.skorTetap && <span className="badge b-purple" title="Nilai resmi diambil dari sheet Recap KPI spreadsheet">Dari Recap spreadsheet</span>}
          {!lapor.lengkap && !final && <span className="badge b-gray">Skor sementara</span>}
          {lapor.diverifikasiOleh && (final || lapor.status === 'dikembalikan') && <span className="tiny muted">oleh {lapor.diverifikasiOleh}</span>}
          {admin && lapor.insentif != null && <span className="badge b-green" title="Insentif KPI bulan ini">Insentif {rupiah(lapor.insentif)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <SkorKpi skor={lapor.skor} predikat={lapor.lengkap || lapor.skorTetap ? lapor.predikat : 'sementara'} label="KPI" besar />
        {(kbi.length > 0 || lapor.skorKbi != null) && <SkorKpi skor={lapor.skorKbi} label="KBI" besar />}
      </div>
    </div>

    {lapor.status === 'dikembalikan' && lapor.catatanVerifikator && <div className="err"><b>Perlu diperbaiki:</b> {lapor.catatanVerifikator}</div>}
    {final && lapor.catatanVerifikator && <div className="note"><b>Catatan atasan:</b> {lapor.catatanVerifikator}</div>}
    {mode === 'verifikator' && lapor.status === 'diajukan' && !bolehSetujui && <div className="note">Sudah diajukan dan menunggu verifikasi atasan.</div>}
    {mode === 'karyawan' && !final && <div className="note">KPI & KBI Anda diisi oleh atasan / HC, lalu diverifikasi atasan. Nilai menjadi final setelah disetujui.</div>}

    <h4 className="kp-sub"><Ikon n="target" />KPI — Kinerja</h4>
    {grupKpi.map(([g, l]) => <div key={g || '-'}>{g && <div className="tiny kp-grup"><b>{g}</b></div>}<div className="kp-daftar">{l.map(barisKpi)}</div></div>)}
    {kbi.length > 0 && <><h4 className="kp-sub"><Ikon n="users" />KBI — Perilaku <span className="tiny muted">(skor 1–5 · nilai = total realisasi ÷ total target)</span></h4>
      <div className="kp-daftar">{kbi.map(barisKbi)}</div></>}

    {bolehIsi && <><label>Catatan (opsional)</label>
      <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. pencapaian penting atau masukan untuk bulan depan" /></>}
    {bolehIsi && <div className="kp-aksi">
      <button className="btn ghost sm auto" disabled={kirim} onClick={() => putus('simpan')}><Ikon n="check" />Simpan</button>
      {!bolehSetujui && lapor.status !== 'diajukan' && <button className="btn sm auto" disabled={kirim} onClick={() => putus('ajukan')}><Ikon n="send" />Ajukan ke Atasan</button>}
      {bolehSetujui && lapor.status === 'diajukan' && <button className="btn red sm auto" disabled={kirim} onClick={() => putus('kembalikan')}><Ikon n="undo-2" />Kembalikan</button>}
      {bolehSetujui && <button className="btn green sm auto" disabled={kirim} onClick={() => putus('setujui')}><Ikon n="circle-check" />Setujui & Finalkan</button>}
      {admin && <button className="btn ghost sm auto" disabled={kirim} onClick={() => jalankan('kpi_muat_ulang', { id: lapor.id })} title="Pakai indikator template terbaru"><Ikon n="repeat" />Muat ulang template</button>}
    </div>}
    {mode === 'verifikator' && final && admin && !lapor.skorTetap && <div className="kp-aksi"><button className="btn ghost sm auto" onClick={buka}><Ikon n="undo-2" />Buka kembali untuk koreksi</button></div>}
  </div>);
}
