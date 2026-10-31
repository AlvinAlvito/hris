'use client';
/* Lembar KPI bulanan: dipakai karyawan (mengisi realisasi & mengajukan) dan verifikator (mengoreksi, menyetujui, mengembalikan) */
import { useState } from 'react';
import { useAplikasi } from './Aplikasi';
import { Ikon } from './Ikon';
import { api } from '@/lib/klien/api';
import { NAMA_BULAN } from '@/lib/klien/format';

export type NilaiKpi = { id: number; nama: string; deskripsi: string; satuan: string; target: number; bobot: number; arah: string; sumber: string; sumberLabel: string;
  realisasi: number | null; bukti: string; keterangan: string; pencapaian: number | null };
export type LaporKpi = { id: number; userId: number; nama: string; nik: string; jabatan: string; dept: string; periode: string; template: string; status: string; statusLabel: string;
  skor: number | null; predikat: string; lengkap: boolean; catatan: string; catatanVerifikator: string; diajukan: string | null; diverifikasiOleh: string; diverifikasi: string | null; nilai: NilaiKpi[] };
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

export function SkorKpi({ skor, predikat, besar }: { skor: number | null; predikat?: string; besar?: boolean }) {
  if (skor == null) return <span className={'kp-skor kosong' + (besar ? ' besar' : '')}><b>—</b>{besar && <small>belum diisi</small>}</span>;
  return <span className={'kp-skor ' + kelasPredikat(skor) + (besar ? ' besar' : '')}><b>{skor.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</b>{besar && predikat && <small>{predikat}</small>}</span>;
}

/* grafik batang skor 12 bulan terakhir (terlama di kiri) */
export function GrafikRiwayat({ riwayat, pilih }: { riwayat: RiwayatKpi[]; pilih?: (p: string) => void }) {
  const data = [...riwayat].reverse();
  if (!data.length) return <div className="empty tiny">Belum ada riwayat KPI.</div>;
  return (
    <div className="kp-grafik">{data.map((r) => (
      <button key={r.periode} type="button" className="kp-batang" onClick={() => pilih?.(r.periode)} title={`${bulanTeks(r.periode)}: ${r.skor ?? '-'} ${r.predikat}`}>
        <span className="kp-nilai">{r.skor == null ? '–' : Math.round(r.skor)}</span>
        <span className="kp-tiang"><i className={kelasPredikat(r.skor) + (r.status !== 'disetujui' ? ' sementara' : '')} style={{ height: Math.min(100, ((r.skor ?? 0) / 120) * 100) + '%' }} /></span>
        <span className="kp-bulan">{NAMA_BULAN[+r.periode.slice(5, 7) - 1].slice(0, 3)}</span>
      </button>))}
    </div>
  );
}

export function LembarKpi({ lapor, mode, admin, segarkan }: { lapor: LaporKpi; mode: 'karyawan' | 'verifikator'; admin?: boolean; segarkan: () => void }) {
  const { toast, galat, tanya, yakin } = useAplikasi();
  const final = lapor.status === 'disetujui';
  const bolehIsi = mode === 'karyawan' ? ['draf', 'dikembalikan'].includes(lapor.status) : !final;
  const [isi, setIsi] = useState<Record<number, Partial<NilaiKpi>>>({});
  const [catatan, setCatatan] = useState(mode === 'karyawan' ? lapor.catatan : '');
  const [kirim, setKirim] = useState(false);
  const ubah = (id: number, k: keyof NilaiKpi, v: unknown) => setIsi((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));
  const nilai = (x: NilaiKpi, k: keyof NilaiKpi) => (isi[x.id]?.[k] !== undefined ? isi[x.id]![k] : x[k]) as never;
  const kumpul = () => Object.entries(isi).map(([id, v]) => ({ id: +id, ...v }));

  const jalankan = async (aksi: string, data: Record<string, unknown>) => {
    setKirim(true);
    try { const r = await api<{ pesan: string }>(aksi, data); toast(r.pesan); setIsi({}); segarkan(); } catch (e) { galat(e); } finally { setKirim(false); }
  };
  const simpanKaryawan = async (ajukan: boolean) => {
    if (ajukan && !(await yakin(`Ajukan KPI ${bulanTeks(lapor.periode)}?`, 'Setelah diajukan, isian tidak bisa diubah kecuali dikembalikan atasan.', { ya: 'Ajukan' }))) return;
    jalankan('kpi_simpan', { id: lapor.id, nilai: kumpul(), catatan, ajukan });
  };
  const verifikasi = async (keputusan: 'simpan' | 'setujui' | 'kembalikan') => {
    let c = catatan;
    if (keputusan === 'kembalikan') {
      const t = await tanya('Apa yang perlu diperbaiki karyawan?', c, { judul: 'Kembalikan KPI', panjang: true, wajib: true });
      if (t === null) return; c = t;
    }
    if (keputusan === 'setujui' && !(await yakin(`Setujui KPI ${lapor.nama}?`, 'Skor bulan ini menjadi final dan karyawan mendapat notifikasi.', { ya: 'Setujui' }))) return;
    jalankan('kpi_verifikasi', { id: lapor.id, nilai: kumpul(), catatan: c, keputusan });
  };
  const buka = async () => {
    const a = await tanya('Alasan membuka kembali (wajib):', '', { judul: 'Buka kembali KPI', panjang: true, wajib: true });
    if (a !== null) jalankan('kpi_buka', { id: lapor.id, alasan: a });
  };

  return (<div className="kp-lembar">
    <div className="kp-kepala">
      <div style={{ minWidth: 0 }}>
        <div className="tiny muted">{bulanTeks(lapor.periode)} · {lapor.template}</div>
        {mode === 'verifikator' && <h3 style={{ margin: '2px 0 0' }}>{lapor.nama}</h3>}
        {mode === 'verifikator' && <div className="tiny muted">{lapor.jabatan}{lapor.dept ? ' · ' + lapor.dept : ''} · {lapor.nik}</div>}
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className={'badge ' + WARNA_STATUS[lapor.status]}>{lapor.statusLabel}</span>
          {!lapor.lengkap && !final && <span className="badge b-gray">Skor sementara</span>}
          {lapor.diverifikasiOleh && (final || lapor.status === 'dikembalikan') && <span className="tiny muted">oleh {lapor.diverifikasiOleh}</span>}
        </div>
      </div>
      <SkorKpi skor={lapor.skor} predikat={lapor.lengkap ? lapor.predikat : 'sementara'} besar />
    </div>

    {lapor.status === 'dikembalikan' && lapor.catatanVerifikator && <div className="err"><b>Perlu diperbaiki:</b> {lapor.catatanVerifikator}</div>}
    {final && lapor.catatanVerifikator && <div className="note"><b>Catatan atasan:</b> {lapor.catatanVerifikator}</div>}
    {mode === 'verifikator' && lapor.catatan && <div className="note"><b>Catatan karyawan:</b> {lapor.catatan}</div>}
    {mode === 'karyawan' && lapor.status === 'diajukan' && <div className="note">KPI sudah diajukan dan sedang diverifikasi atasan / HC.</div>}

    <div className="kp-daftar">{lapor.nilai.map((x) => {
      const oto = x.sumber !== 'manual', r = nilai(x, 'realisasi') as number | null, t = nilai(x, 'target') as number;
      return (
        <div key={x.id} className="kp-ind">
          <div className="kp-ind-atas">
            <div style={{ minWidth: 0 }}><b>{x.nama}</b>{x.deskripsi && <div className="tiny muted">{x.deskripsi}</div>}</div>
            <span className="kp-bobot">Bobot {x.bobot}%</span>
          </div>
          <div className="kp-ind-isi">
            <div><span className="tiny muted">Target</span>
              {mode === 'verifikator' && bolehIsi && !oto && x.arah !== 'ya_tidak'
                ? <input type="number" min={0} step="any" value={t ?? ''} onChange={(e) => ubah(x.id, 'target', e.target.value)} />
                : <b>{x.arah === 'ya_tidak' ? 'Ya' : angka(x.target, x.satuan)}{x.arah === 'turun' && <span className="tiny muted"> (maks.)</span>}</b>}</div>
            <div><span className="tiny muted">Realisasi</span>
              {oto ? <b title={x.sumberLabel}>{x.realisasi == null ? <span className="tiny muted">tidak ada data</span> : angka(x.realisasi, x.satuan)} <span className="badge b-blue kp-oto"><Ikon n="sparkles" />otomatis</span></b>
                : bolehIsi ? (x.arah === 'ya_tidak'
                  ? <select value={r == null ? '' : String(r)} onChange={(e) => ubah(x.id, 'realisasi', e.target.value)}><option value="">— pilih —</option><option value="1">Ya, tercapai</option><option value="0">Tidak</option></select>
                  : <input type="number" min={0} step="any" inputMode="decimal" placeholder={'dalam ' + (x.satuan || 'angka')} value={r ?? ''} onChange={(e) => ubah(x.id, 'realisasi', e.target.value)} />)
                  : <b>{x.arah === 'ya_tidak' ? (x.realisasi == null ? '—' : x.realisasi >= 1 ? 'Ya' : 'Tidak') : angka(x.realisasi, x.satuan)}</b>}</div>
            <div className="kp-capai"><span className="tiny muted">Pencapaian</span>
              <b className={kelasPredikat(x.pencapaian)}>{x.pencapaian == null ? '—' : x.pencapaian.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'}</b></div>
          </div>
          <div className="bar kp-bar"><i className={kelasPredikat(x.pencapaian)} style={{ width: Math.min(100, ((x.pencapaian ?? 0) / 120) * 100) + '%' }} /><span className="kp-garis100" /></div>
          {!oto && (bolehIsi ? (
            <div className="row kp-bukti">
              <input placeholder="Tautan bukti (opsional) — Drive, foto, laporan" value={nilai(x, 'bukti') ?? ''} onChange={(e) => ubah(x.id, 'bukti', e.target.value)} />
              <input placeholder="Keterangan (opsional)" value={nilai(x, 'keterangan') ?? ''} onChange={(e) => ubah(x.id, 'keterangan', e.target.value)} />
            </div>) : (x.bukti || x.keterangan) && (
            <div className="tiny kp-info">{x.bukti && <a href={x.bukti} target="_blank" rel="noreferrer noopener"><Ikon n="external-link" />Lihat bukti</a>}{x.keterangan && <span>{x.keterangan}</span>}</div>))}
          {oto && <div className="tiny muted">{x.sumberLabel} — dihitung dari {['kehadiran', 'tepat_waktu'].includes(x.sumber) ? 'data absensi' : 'menu Pekerjaan Saya'}{final ? ' (dikunci saat disetujui)' : ''}.
            {x.sumber === 'utilisasi' && ' Nilai maksimal 100% (kerja berlebih tidak menambah nilai).'}{x.realisasi == null && ' Belum ada data bulan ini, sehingga tidak ikut dihitung dan bobotnya terbagi ke indikator lain.'}</div>}
        </div>);
    })}</div>

    {bolehIsi && <><label>{mode === 'karyawan' ? 'Catatan untuk atasan (opsional)' : 'Catatan verifikasi (opsional)'}</label>
      <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder={mode === 'karyawan' ? 'mis. kendala atau pencapaian penting bulan ini' : 'mis. masukan untuk bulan depan'} /></>}

    {mode === 'karyawan' && bolehIsi && <div className="row" style={{ marginTop: 12 }}>
      <button className="btn ghost" disabled={kirim} onClick={() => simpanKaryawan(false)}><Ikon n="check" />Simpan Draf</button>
      <button className="btn" disabled={kirim} onClick={() => simpanKaryawan(true)}><Ikon n="send" />Ajukan ke Atasan</button></div>}
    {mode === 'verifikator' && bolehIsi && <div className="kp-aksi">
      <button className="btn ghost sm auto" disabled={kirim} onClick={() => verifikasi('simpan')}><Ikon n="check" />Simpan perubahan</button>
      <button className="btn red sm auto" disabled={kirim} onClick={() => verifikasi('kembalikan')}><Ikon n="undo-2" />Kembalikan</button>
      <button className="btn green sm auto" disabled={kirim} onClick={() => verifikasi('setujui')}><Ikon n="circle-check" />Setujui & Finalkan</button>
      {admin && <button className="btn ghost sm auto" disabled={kirim} onClick={() => jalankan('kpi_muat_ulang', { id: lapor.id })} title="Pakai indikator template terbaru"><Ikon n="repeat" />Muat ulang template</button>}
    </div>}
    {mode === 'verifikator' && final && admin && <div className="kp-aksi"><button className="btn ghost sm auto" onClick={buka}><Ikon n="undo-2" />Buka kembali untuk koreksi</button></div>}
  </div>);
}
