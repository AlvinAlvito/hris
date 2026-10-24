'use client';
/* Bagian bersama modul keuangan: alur status, isian rupiah, form & kartu reimburse dan kasbon, slip gaji */
import { useState } from 'react';
import { isAdminUp, useAplikasi } from './Aplikasi';
import { Avatar } from './Avatar';
import { ChipBerkas } from './Dokumen';
import { Ikon } from './Ikon';
import { dataBukti, InputBuktiPengajuan, TautanBukti } from './BuktiPengajuan';
import { api } from '@/lib/klien/api';
import { bacaBerkas } from '@/lib/klien/berkas';
import { angka, periodeTeks, rupiah, teksStatus, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
type Langkah = [string, 'ok' | 'now' | 'no' | ''];

export function Alur({ langkah }: { langkah: Langkah[] }) {
  return (<div className="alur">{langkah.map(([t, st]) => (
    <div key={t} className={'t ' + st}><div className="o"><Ikon n={st === 'ok' ? 'check' : st === 'no' ? 'x' : st === 'now' ? 'hourglass' : 'clock'} /></div>{t}</div>))}</div>);
}

const WARNA_STATUS: Record<string, string> = { 'Menunggu HR': 'b-amber', 'Menunggu Finance': 'b-blue', Disetujui: 'b-purple', Dibayar: 'b-green',
  'Ditolak HR': 'b-red', 'Ditolak Finance': 'b-red', Dibatalkan: 'b-gray', Aktif: 'b-blue', Lunas: 'b-green' };
export function BadgeKeuangan({ st }: { st: string }) { return <span className={'badge ' + (WARNA_STATUS[st] ?? 'b-gray')}>{teksStatus(st)}</span>; }

/* isian nominal dengan pemisah ribuan; nilai berupa angka */
export function InputUang({ nilai, ubah, autoFocus }: { nilai: number; ubah: (n: number) => void; autoFocus?: boolean }) {
  return <input inputMode="numeric" placeholder="0" autoFocus={autoFocus} value={nilai ? angka(nilai) : ''} onChange={(e) => ubah(+e.target.value.replace(/\D/g, '') || 0)} />;
}
export function Sakelar({ on, ubah, judul, ket }: { on: boolean; ubah: (v: boolean) => void; judul: string; ket?: string }) {
  return (<div className="switch"><div><b>{judul}</b>{ket && <div className="tiny muted">{ket}</div>}</div>
    <div className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} tabIndex={0} onClick={() => ubah(!on)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); ubah(!on); } }} /></div>);
}

/* ================= REIMBURSE ================= */
export function FormReimburse({ selesai }: { selesai: () => void }) {
  const { settings, tutupSheet, toast, galat } = useAplikasi();
  const kat: string[] = settings.reimburseKategori?.length ? settings.reimburseKategori : ['Lainnya'];
  const [k, setK] = useState(kat[0]), [tgl, setTgl] = useState(todayStr()), [keg, setKeg] = useState(''), [nom, setNom] = useState(0), [ket, setKet] = useState('');
  const [files, setFiles] = useState<File[]>([]), [kirim, setKirim] = useState(false);
  const [buktiLink, setBuktiLink] = useState('');
  const simpan = async () => {
    if (files.length > 5) { toast('Maksimal 5 lampiran', true); return; }
    if (!nom) { toast('Isi nominal', true); return; }
    setKirim(true);
    try {
      const bukti = await Promise.all(files.map((f) => bacaBerkas(f, 1600)));
      const r = await api<{ pesan: string }>('rb_ajukan', { kategori: k, tanggal: tgl, kegiatan: keg.trim(), nominal: nom, keterangan: ket.trim(),
        buktiLink: buktiLink.trim(), bukti: bukti.map((b) => ({ nama: b.nama, data: b.data })) });
      tutupSheet(); toast(r.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  return (<>
    <h3><Ikon n="receipt" />Ajukan Reimburse</h3>
    <div className="row">
      <div><label>Kategori</label><select value={k} onChange={(e) => setK(e.target.value)}>{kat.map((x) => <option key={x}>{x}</option>)}</select></div>
      <div><label>Tanggal transaksi</label><input type="date" value={tgl} max={todayStr()} onChange={(e) => setTgl(e.target.value)} /></div>
    </div>
    <label>Kegiatan / acara <span className="tiny">(opsional, mis. OSN Regional Medan)</span></label><input value={keg} onChange={(e) => setKeg(e.target.value)} placeholder="Nama kegiatan" />
    <label>Nominal (Rp)</label><InputUang nilai={nom} ubah={setNom} />
    <label>Keterangan</label><textarea value={ket} onChange={(e) => setKet(e.target.value)} placeholder="mis. tiket kereta Jakarta–Bandung untuk survei venue" />
    <label>Foto nota / bukti bayar <span className="tiny">(opsional, 1–5 berkas)</span></label>
    <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
    {files.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{files.map((f, n) => /^image\//.test(f.type)
      ? <img key={n} src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
      : <span key={n} className="badge b-blue"><Ikon n="file-text" />{f.name}</span>)}</div>}
    <label>Tautan nota / bukti <span className="tiny">(Drive/Sheet, bila tidak mengunggah file)</span></label>
    <input type="url" value={buktiLink} onChange={(e) => setBuktiLink(e.target.value)} placeholder="https://drive.google.com/..." />
    <div className="note" style={{ marginTop: 12 }}>Klaim paling lambat {settings.reimburseMaksHari || 60} hari setelah tanggal transaksi. Foto dikompres otomatis agar hemat kuota.</div>
    <button className="btn" disabled={kirim} onClick={simpan}>{kirim ? <><span className="spin" /> Mengunggah…</> : <><Ikon n="send" />Kirim Klaim</>}</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

export function ItemReimburse({ r, admin, segarkan }: { r: Data; admin?: boolean; segarkan: () => void }) {
  const { me, bukaSheet, tutupSheet, tanya, yakin, toast, galat, muatInbox } = useAplikasi();
  const st = r.status, tolakHr = st === 'Ditolak HR', tolakFin = st === 'Ditolak Finance';
  const ulang = () => { segarkan(); muatInbox(); };
  const saya = r.userId === me?.id;
  const putusHr = async (setuju: boolean) => {
    const c = await tanya(setuju ? 'Catatan verifikasi (opsional):' : 'Alasan penolakan (wajib):', '', { judul: setuju ? 'Verifikasi klaim' : 'Tolak klaim', panjang: !setuju, wajib: !setuju });
    if (c === null) return;
    api<{ pesan: string }>('rb_putus_hr', { id: r.id, setuju, catatan: c }).then((x) => { toast(x.pesan); ulang(); }).catch(galat);
  };
  const tolakFinance = async () => {
    const c = await tanya('Alasan penolakan (wajib):', '', { judul: 'Tolak klaim', panjang: true, wajib: true });
    if (c === null) return;
    api<{ pesan: string }>('rb_putus_fin', { id: r.id, setuju: false, catatan: c }).then((x) => { toast(x.pesan); ulang(); }).catch(galat);
  };
  const setujui = () => {
    function Form() {
      const [nom, setNom] = useState<number>(r.nominal), [metode, setMetode] = useState('transfer'), [sudah, setSudah] = useState(true);
      const [per, setPer] = useState(todayStr().slice(0, 7)), [cat, setCat] = useState('');
      const kirim = () => api<{ pesan: string }>('rb_putus_fin', { id: r.id, setuju: true, nominalDisetujui: nom, metode, periodeGaji: per, sudahDibayar: sudah, catatan: cat.trim() })
        .then((x) => { tutupSheet(); toast(x.pesan); ulang(); }).catch(galat);
      return (<>
        <h3><Ikon n="badge-check" />Setujui Reimburse</h3>
        <div className="tiny muted">{r.nama} · {r.kategori} · diajukan {rupiah(r.nominal)}</div>
        <label>Nominal disetujui</label><InputUang nilai={nom} ubah={setNom} />
        <label>Cara pembayaran</label>
        <div className="seg">{[['transfer', 'banknote', 'Transfer'], ['gaji', 'calculator', 'Masuk slip gaji']].map(([v, ic, t]) =>
          <button key={v} type="button" className={metode === v ? 'on' : ''} onClick={() => setMetode(v)}><Ikon n={ic} />{t}</button>)}</div>
        {metode === 'transfer' ? <Sakelar on={sudah} ubah={setSudah} judul="Sudah ditransfer sekarang" ket="Matikan bila transfer dilakukan belakangan" />
          : <><label>Periode gaji</label><input type="month" value={per} onChange={(e) => setPer(e.target.value)} /></>}
        <label>Catatan {nom < r.nominal ? '(wajib karena nominal dikurangi)' : '(opsional)'}</label><input value={cat} onChange={(e) => setCat(e.target.value)} />
        <button className="btn green" onClick={kirim}><Ikon n="check" />Setujui</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  const bayar = async () => {
    if (!(await yakin('Tandai klaim ini sudah ditransfer?', 'Tanggal bayar dicatat hari ini.'))) return;
    api<{ pesan: string }>('rb_bayar', { id: r.id }).then((x) => { toast(x.pesan); ulang(); }).catch(galat);
  };
  const batal = async () => {
    if (!(await yakin('Batalkan klaim ini?'))) return;
    api<{ pesan: string }>('rb_batal', { id: r.id }).then((x) => { toast(x.pesan); segarkan(); }).catch(galat);
  };
  let aksi = null;
  if (admin && isAdminUp(me)) {
    if (saya && /Menunggu/.test(st)) aksi = <span className="tiny muted">Klaim Anda sendiri — diputus rekan HC lain.</span>;
    else if (st === 'Menunggu HR') aksi = <><button className="btn green sm auto" onClick={() => putusHr(true)}><Ikon n="check" />Verifikasi</button>
      <button className="btn red sm auto" onClick={() => putusHr(false)}><Ikon n="x" />Tolak</button></>;
    else if (st === 'Menunggu Finance') aksi = <><button className="btn green sm auto" onClick={setujui}><Ikon n="badge-check" />Setujui</button>
      <button className="btn red sm auto" onClick={tolakFinance}><Ikon n="x" />Tolak</button></>;
    else if (st === 'Disetujui' && r.metodeBayar === 'transfer') aksi = <><button className="btn sm auto" onClick={bayar}><Ikon n="banknote" />Tandai sudah ditransfer</button>
      <span className="tiny muted" style={{ alignSelf: 'center' }}>{r.bankNama} {r.bankRekening || 'rekening belum diisi'}</span></>;
  }
  return (
    <div className="item">
      <div className="top">
        <div className="orang">{admin ? <Avatar u={r} ukuran={38} /> : <span className="aj-ic"><Ikon n="receipt" /></span>}
          <div><div className="nm">{admin && r.nama + ' · '}{r.kategori}</div><div className="dt">{tglPendek(r.tanggal)}{r.kegiatan && ' · ' + r.kegiatan}</div></div></div>
        <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 15 }}>
          {r.nominalDisetujui != null && r.nominalDisetujui !== r.nominal ? <><s className="muted">{rupiah(r.nominal)}</s> <b>{rupiah(r.nominalDisetujui)}</b></> : <b>{rupiah(r.nominal)}</b>}</div>
          <BadgeKeuangan st={st} /></div>
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>{r.keterangan}</div>
      <Alur langkah={[['Diajukan', 'ok'], ['HC', tolakHr ? 'no' : st === 'Menunggu HR' ? 'now' : 'ok'],
        ['Pencairan', tolakHr ? '' : tolakFin ? 'no' : st === 'Menunggu Finance' ? 'now' : st === 'Disetujui' || st === 'Dibayar' ? 'ok' : ''],
        [r.metodeBayar === 'gaji' ? 'Slip gaji' : 'Dibayar', st === 'Dibayar' ? 'ok' : st === 'Disetujui' ? 'now' : '']]} />
      {r.hrCatatan && <div className="kv"><span>Catatan verifikasi ({r.hrOleh})</span><span style={{ textAlign: 'right' }}>{r.hrCatatan}</span></div>}
      {r.finCatatan && <div className="kv"><span>Catatan persetujuan ({r.finOleh})</span><span style={{ textAlign: 'right' }}>{r.finCatatan}</span></div>}
      {st === 'Disetujui' && <div className="kv"><span>Pembayaran</span><span>{r.metodeBayar === 'gaji' ? 'bersama gaji ' + periodeTeks(r.periodeGaji) : 'transfer — menunggu diproses HC'}</span></div>}
      {st === 'Dibayar' && <div className="kv"><span>Dibayar</span><span>{tglPendek(r.tglBayar)}{r.metodeBayar === 'gaji' ? ' (slip gaji)' : ' (transfer)'}</span></div>}
      <div><ChipBerkas list={r.bukti} /></div>
      <TautanBukti link={r.buktiLink} />
      {aksi && <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', justifyContent: 'flex-start' }}>{aksi}</div>}
      {!admin && /Menunggu/.test(st) && <button className="btn ghost sm auto" style={{ marginTop: 10 }} onClick={batal}><Ikon n="x" />Batalkan</button>}
    </div>
  );
}

/* ================= KASBON ================= */
export function FormKasbon({ selesai }: { selesai: () => void }) {
  const { settings, tutupSheet, toast, galat } = useAplikasi();
  const maks = settings.kasbonTenorMaks || 12;
  const [nom, setNom] = useState(0), [tenor, setTenor] = useState(Math.min(3, maks)), [alasan, setAlasan] = useState(''), [kirim, setKirim] = useState(false);
  const [buktiLink, setBuktiLink] = useState(''), [buktiFile, setBuktiFile] = useState<File | null>(null);
  const simpan = async () => {
    setKirim(true);
    try {
      const r = await api<{ pesan: string }>('ks_ajukan', { nominal: nom, tenor, alasan: alasan.trim(), buktiLink: buktiLink.trim(), buktiFile: await dataBukti(buktiFile) });
      tutupSheet(); toast(r.pesan); selesai();
    } catch (e) { galat(e); setKirim(false); }
  };
  return (<>
    <h3><Ikon n="wallet" />Ajukan Kasbon</h3>
    <label>Nominal (Rp)</label><InputUang nilai={nom} ubah={setNom} autoFocus />
    <label>Tenor cicilan</label>
    <select value={tenor} onChange={(e) => setTenor(+e.target.value)}>{Array.from({ length: maks }, (_, n) => <option key={n} value={n + 1}>{n + 1} bulan</option>)}</select>
    <div className="note" style={{ marginTop: 12 }}>{nom ? <>Cicilan <b>{rupiah(Math.ceil(nom / tenor))}</b>/bulan selama {tenor} bulan, dipotong otomatis dari gaji setelah dicairkan HC.</>
      : 'Isi nominal untuk melihat simulasi cicilan.'}</div>
    <label>Alasan</label><textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. biaya pendidikan anak" />
    <InputBuktiPengajuan link={buktiLink} setLink={setBuktiLink} file={buktiFile} setFile={setBuktiFile} />
    <button className="btn" disabled={kirim} onClick={simpan}><Ikon n="send" />Ajukan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

export function ItemKasbon({ k, admin, segarkan }: { k: Data; admin?: boolean; segarkan: () => void }) {
  const { me, bukaSheet, tutupSheet, tanya, yakin, toast, galat, muatInbox } = useAplikasi();
  const st = k.status, saya = k.userId === me?.id;
  const ulang = () => { segarkan(); muatInbox(); };
  const putusHr = async (setuju: boolean) => {
    const c = await tanya(setuju ? 'Catatan verifikasi (opsional):' : 'Alasan penolakan (wajib):', '', { judul: setuju ? 'Verifikasi kasbon' : 'Tolak kasbon', panjang: !setuju, wajib: !setuju });
    if (c === null) return;
    api<{ pesan: string }>('ks_putus_hr', { id: k.id, setuju, catatan: c }).then((x) => { toast(x.pesan); ulang(); }).catch(galat);
  };
  const tolakFinance = async () => {
    const c = await tanya('Alasan penolakan (wajib):', '', { judul: 'Tolak kasbon', panjang: true, wajib: true });
    if (c === null) return;
    api<{ pesan: string }>('ks_putus_fin', { id: k.id, setuju: false, catatan: c }).then((x) => { toast(x.pesan); ulang(); }).catch(galat);
  };
  const cairkan = () => {
    function Form() {
      const d = new Date(); d.setMonth(d.getMonth() + 1, 1);
      const [tgl, setTgl] = useState(todayStr()), [mulai, setMulai] = useState(todayStr(d).slice(0, 7)), [tenor, setTenor] = useState<number>(k.tenor), [cat, setCat] = useState('');
      const kirim = () => api<{ pesan: string }>('ks_putus_fin', { id: k.id, setuju: true, tglCair: tgl, mulaiPotong: mulai, tenor, catatan: cat.trim() })
        .then((x) => { tutupSheet(); toast(x.pesan); ulang(); }).catch(galat);
      return (<>
        <h3><Ikon n="hand-coins" />Setujui & Cairkan Kasbon</h3>
        <div className="tiny muted">{k.nama} · {rupiah(k.nominal)}</div>
        <div className="row"><div><label>Tanggal pencairan</label><input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} /></div>
          <div><label>Mulai dipotong gaji</label><input type="month" value={mulai} onChange={(e) => setMulai(e.target.value)} /></div></div>
        <label>Tenor (bulan)</label><input type="number" min={1} max={60} value={tenor} onChange={(e) => setTenor(+e.target.value)} />
        <div className="note" style={{ marginTop: 10 }}>Cicilan {rupiah(Math.ceil(k.nominal / Math.max(1, tenor)))}/bulan</div>
        <label>Catatan (opsional)</label><input value={cat} onChange={(e) => setCat(e.target.value)} />
        <button className="btn green" onClick={kirim}><Ikon n="check" />Setujui & Cairkan</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  const lunasi = () => {
    function Form() {
      const [nom, setNom] = useState<number>(k.sisa), [per, setPer] = useState(todayStr().slice(0, 7)), [cat, setCat] = useState('');
      const kirim = () => api<{ pesan: string }>('ks_bayar_manual', { id: k.id, nominal: nom, periode: per, catatan: cat.trim() })
        .then((x) => { tutupSheet(); toast(x.pesan); segarkan(); }).catch(galat);
      return (<>
        <h3><Ikon n="banknote" />Catat Pelunasan Manual</h3>
        <div className="note">Untuk pembayaran di luar potongan gaji (tunai / transfer dari karyawan). Sisa saat ini {rupiah(k.sisa)}.</div>
        <label>Nominal</label><InputUang nilai={nom} ubah={setNom} />
        <label>Periode</label><input type="month" value={per} onChange={(e) => setPer(e.target.value)} />
        <label>Catatan</label><input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="mis. transfer BCA 12/10" />
        <button className="btn" onClick={kirim}><Ikon n="check" />Simpan</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  const batal = async () => {
    if (!(await yakin('Batalkan pengajuan kasbon?'))) return;
    api<{ pesan: string }>('ks_batal', { id: k.id }).then((x) => { toast(x.pesan); segarkan(); }).catch(galat);
  };
  let aksi = null;
  if (admin && isAdminUp(me)) {
    if (saya && /Menunggu/.test(st)) aksi = <span className="tiny muted">Kasbon Anda sendiri — diputus rekan HC lain.</span>;
    else if (st === 'Menunggu HR') aksi = <><button className="btn green sm auto" onClick={() => putusHr(true)}><Ikon n="check" />Verifikasi</button>
      <button className="btn red sm auto" onClick={() => putusHr(false)}><Ikon n="x" />Tolak</button></>;
    else if (st === 'Menunggu Finance') aksi = <><button className="btn green sm auto" onClick={cairkan}><Ikon n="hand-coins" />Setujui & cairkan</button>
      <button className="btn red sm auto" onClick={tolakFinance}><Ikon n="x" />Tolak</button></>;
    else if (st === 'Aktif') aksi = <button className="btn ghost sm auto" onClick={lunasi}><Ikon n="banknote" />Catat pelunasan manual</button>;
  }
  return (
    <div className="item">
      <div className="top">
        <div className="orang">{admin ? <Avatar u={k} ukuran={38} /> : <span className="aj-ic" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}><Ikon n="wallet" /></span>}
          <div><div className="nm">{admin && k.nama + ' · '}{rupiah(k.nominal)}</div><div className="dt">{k.tenor}× cicilan {rupiah(k.cicilan)} · diajukan {tglPendek(k.tglAjukan)}</div></div></div>
        <BadgeKeuangan st={st} />
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>{k.alasan}</div>
      <Alur langkah={[['Diajukan', 'ok'], ['HC', st === 'Ditolak HR' ? 'no' : st === 'Menunggu HR' ? 'now' : 'ok'],
        ['Pencairan', st === 'Ditolak HR' ? '' : st === 'Ditolak Finance' ? 'no' : st === 'Menunggu Finance' ? 'now' : st === 'Aktif' || st === 'Lunas' ? 'ok' : ''],
        ['Lunas', st === 'Lunas' ? 'ok' : st === 'Aktif' ? 'now' : '']]} />
      {(st === 'Aktif' || st === 'Lunas') && <>
        <div className="bar"><i style={{ width: Math.round(k.terbayar / k.nominal * 100) + '%' }} /></div>
        <div className="kv"><span>Terbayar</span><span>{rupiah(k.terbayar)} · sisa <b>{rupiah(k.sisa)}</b></span></div>
        <div className="kv"><span>Dicairkan</span><span>{tglPendek(k.tglCair)} · potong mulai {periodeTeks(k.mulaiPotong)}</span></div></>}
      {k.hrCatatan && <div className="kv"><span>Catatan verifikasi</span><span>{k.hrCatatan}</span></div>}
      {k.finCatatan && <div className="kv"><span>Catatan pencairan</span><span>{k.finCatatan}</span></div>}
      <TautanBukti link={k.buktiLink} />
      {k.pembayaran?.length > 0 && <details style={{ marginTop: 6 }}><summary className="tiny" style={{ cursor: 'pointer', color: 'var(--primary)' }}>Riwayat cicilan ({k.pembayaran.length})</summary>
        {k.pembayaran.map((b: Data, n: number) => <div key={n} className="kv"><span>{periodeTeks(b.periode)} · {b.sumber === 'gaji' ? 'potong gaji' : 'bayar manual'}</span><span>{rupiah(b.nominal)}</span></div>)}</details>}
      {aksi && <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', justifyContent: 'flex-start' }}>{aksi}</div>}
      {!admin && /Menunggu/.test(st) && <button className="btn ghost sm auto" style={{ marginTop: 10 }} onClick={batal}><Ikon n="x" />Batalkan</button>}
    </div>
  );
}

/* ================= SLIP GAJI ================= */
export function useLihatSlip() {
  const { bukaSheet, tutupSheet, galat } = useAplikasi();
  return (id: number) => api<Data>('py_slip', { id }).then((d) => {
    const x = d.slip, b: Data[] = x.rincian?.baris ?? [], pj = x.rincian?.pajak;
    const baris = (jenis: string) => b.filter((r) => r.jenis === jenis).map((r, n) => (
      <tr key={n}><td>{r.nama}{r.ket && <div style={{ fontSize: 11, color: '#6b7280' }}>{r.ket}</div>}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{rupiah(r.nominal)}</td></tr>));
    const tr = (k: string, v: number | string, tot = false) => <tr className={tot ? 'tot' : undefined}><td>{k}</td><td style={{ textAlign: 'right' }}>{typeof v === 'number' ? rupiah(v) : v}</td></tr>;
    const cetak = () => { document.body.classList.add('cetak'); setTimeout(() => { window.print(); document.body.classList.remove('cetak'); }, 50); };
    bukaSheet(<>
      <div className="slip">
        <div className="kop"><img src={d.logo || '/logo-posi.png'} alt="" />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 16 }}>{d.perusahaan}</div><div style={{ color: '#6b7280' }}>SLIP GAJI · {periodeTeks(x.periode).toUpperCase()}</div></div>
          {x.statusPeriode !== 'final' && <span className="badge b-amber">DRAF</span>}</div>
        <table style={{ marginTop: 12 }}><tbody><tr>
          <td style={{ border: 0, width: '50%' }}><b>{x.nama}</b><br />NIK {x.nik}<br />{x.jabatan}{x.dept && ' · ' + x.dept}</td>
          <td style={{ border: 0, textAlign: 'right' }}>PTKP {x.ptkp}<br />NPWP {x.npwp || '-'}<br />Hadir {x.hariHadir} hari{x.hariMangkir ? ' · mangkir ' + x.hariMangkir : ''}</td></tr></tbody></table>
        <div className="grid-2" style={{ gap: 18 }}>
          <div><h4>Pendapatan</h4><table><tbody>{baris('pendapatan')}{tr('Total pendapatan', x.totalPendapatan, true)}</tbody></table></div>
          <div><h4>Potongan</h4><table><tbody>{baris('potongan')}{tr('Total potongan', x.totalPotongan, true)}</tbody></table></div>
        </div>
        <div className="thp"><span style={{ fontWeight: 700 }}>Take Home Pay</span><b>{rupiah(x.thp)}</b></div>
        <h4>Ditanggung perusahaan (tidak dipotong dari gaji)</h4><table><tbody>{baris('info')}</tbody></table>
        <h4>Perhitungan PPh 21</h4><table><tbody>
          {tr('Penghasilan bruto untuk pajak', x.brutoPajak)}{tr('Metode', x.pph21Metode)}
          {pj && <>{tr('Bruto setahun', pj.bruto)}{tr('Biaya jabatan', pj.biayaJabatan)}{tr('Iuran JHT + JP pegawai', pj.iuran)}{tr('PTKP', pj.ptkp)}
            {tr('PKP', pj.pkp)}{tr('PPh 21 setahun', pj.pphSetahun)}{tr('Sudah dipotong Jan–Nov', pj.sudahDipotong)}</>}
          {tr('PPh 21 bulan ini', x.pph21, true)}</tbody></table>
        {d.catatan && <div style={{ marginTop: 14, fontSize: 11, color: '#6b7280' }}>{d.catatan}</div>}
      </div>
      <div className="row noprint" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={tutupSheet}>Tutup</button>
        <button className="btn" onClick={cetak}><Ikon n="printer" />Cetak / Simpan PDF</button>
      </div>
    </>, { besar: true });
  }).catch(galat);
}
