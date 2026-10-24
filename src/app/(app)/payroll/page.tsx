'use client';
/* Payroll (HC): periode gaji, data gaji, komponen, saldo awal pajak, tarif BPJS & kebijakan */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Avatar } from '@/components/Avatar';
import { Ikon } from '@/components/Ikon';
import { InputUang, Sakelar, useLihatSlip } from '@/components/Keuangan';
import { api } from '@/lib/klien/api';
import { keExcel } from '@/lib/klien/excel';
import { periodeTeks, rupiah, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const TAB: [string, string, string][] = [['periode', 'calculator', 'Periode Gaji'], ['gaji', 'users', 'Data Gaji'], ['komponen', 'layers', 'Komponen'],
  ['saldo', 'history', 'Saldo Awal Pajak'], ['tarif', 'sliders-horizontal', 'Tarif & BPJS']];
const PTKP = ['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'];

export default function Payroll() {
  const [tab, setTab] = useState('periode');
  return (<>
    <div className="seg" style={{ marginTop: 0 }}>{TAB.map(([k, ic, t]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ikon n={ic} />{t}</button>)}</div>
    {tab === 'periode' && <TabPeriode />}
    {tab === 'gaji' && <TabGaji />}
    {tab === 'komponen' && <TabKomponen />}
    {tab === 'saldo' && <TabSaldo />}
    {tab === 'tarif' && <TabTarif />}
  </>);
}

/* ---------------- PERIODE ---------------- */
function TabPeriode() {
  const { galat, toast, muatInbox } = useAplikasi();
  const [l, setL] = useState<Data[] | null>(null), [pilih, setPilih] = useState<string | null>(null), [baru, setBaru] = useState(todayStr().slice(0, 7));
  const [versi, setVersi] = useState(0);
  const muat = useCallback(() => {
    api<Data[]>('py_periode_daftar', {}, true).then((x) => { setL(x); setPilih((p) => p ?? x[0]?.periode ?? null); setVersi((v) => v + 1); }).catch(galat);
  }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const hitung = (p: string) => {
    if (!p) { toast('Pilih bulan', true); return; }
    api<Data>('py_hitung', { periode: p }).then((r) => {
      toast(r.pesan);
      const h = r.ringkas;
      if (h.tanpaRekening.length) toast('Belum punya nomor rekening: ' + h.tanpaRekening.slice(0, 4).join(', ') + (h.tanpaRekening.length > 4 ? '…' : ''), true);
      setPilih(p); muat(); muatInbox();
    }).catch(galat);
  };
  return (<>
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="calendar" />Periode Penggajian</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input type="month" value={baru} onChange={(e) => setBaru(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn sm auto" onClick={() => hitung(baru)}><Ikon n="sparkles" />Hitung Payroll</button></div></div>
      {!l ? <div className="skel" style={{ height: 120, marginTop: 12 }} /> : l.length ? (
        <div className="tblwrap"><table><thead><tr><th>Periode</th><th>Status</th><th className="r">Slip</th><th className="r">Total THP</th><th className="r">PPh 21</th>
          <th className="r">BPJS Perusahaan</th><th>Dihitung</th><th>Final</th><th /></tr></thead><tbody>
          {l.map((p) => (
            <tr key={p.id} style={{ cursor: 'pointer', background: p.periode === pilih ? 'var(--primary-soft)' : undefined }} onClick={() => setPilih(p.periode)}>
              <td><b>{periodeTeks(p.periode)}</b></td>
              <td>{p.status === 'final' ? <span className="badge b-green"><Ikon n="lock" />Final</span> : <span className="badge b-amber">Draf</span>}</td>
              <td className="r">{p.jumlahSlip}</td><td className="r num"><b>{rupiah(p.totalThp)}</b></td><td className="r num">{rupiah(p.totalPph)}</td>
              <td className="r num">{rupiah(p.totalBpjsPerusahaan)}</td>
              <td className="tiny">{p.dibuatOleh}<div className="muted">{String(p.tglHitung || '').slice(0, 16)}</div></td>
              <td className="tiny">{p.status === 'final' && p.finalOleh ? <>{p.finalOleh}<div className="muted">{String(p.tglFinal || '').slice(0, 16)}</div></> : '—'}</td>
              <td><Ikon n="chevron-right" /></td></tr>))}
        </tbody></table></div>)
        : <div className="empty"><Ikon n="calculator" />Belum ada payroll. Pilih bulan lalu tekan <b>Hitung Payroll</b>.<br /><span className="tiny">Pastikan data gaji karyawan sudah diisi di tab Data Gaji.</span></div>}
    </div>
    {pilih && <DetailPeriode key={pilih + versi} p={pilih} hitung={hitung} segarkan={muat} />}
  </>);
}

function DetailPeriode({ p, hitung, segarkan }: { p: string; hitung: (p: string) => void; segarkan: () => void }) {
  const { galat, toast, yakin, tanya, bukaSheet, tutupSheet, muatInbox } = useAplikasi();
  const lihatSlip = useLihatSlip();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api<Data>('py_periode', { periode: p }, true).then(setD).catch((e) => { setD(null); galat(e); }); }, [p, galat]);
  if (!d) return <div className="skel" style={{ height: 200, marginTop: 16 }} />;
  const per = d.periode, s: Data[] = d.slip, final = per.status === 'final';
  const sum = (k: string) => s.reduce((a, x) => a + x[k], 0);
  const finalkan = async () => {
    if (!(await yakin(`Finalkan payroll ${periodeTeks(p)}?`, 'Slip dikunci dan langsung terlihat oleh karyawan. Cicilan kasbon & reimburse lewat gaji dicatat terbayar.', { ya: 'Finalkan' }))) return;
    api<{ pesan: string }>('py_finalkan', { periode: p }).then((r) => { toast(r.pesan); segarkan(); muatInbox(); }).catch(galat);
  };
  const buka = async () => {
    const a = await tanya('Alasan membuka kembali (wajib):', '', { judul: 'Buka kembali ' + periodeTeks(p), panjang: true, wajib: true });
    if (a === null) return;
    api<{ pesan: string }>('py_buka', { periode: p, alasan: a }).then((r) => { toast(r.pesan); segarkan(); }).catch(galat);
  };
  const penyesuaian = () => {
    function Form() {
      const [uid, setUid] = useState<number>(s[0]?.userId ?? 0), [nama, setNama] = useState(''), [jenis, setJenis] = useState('tunjangan');
      const [nom, setNom] = useState(0), [pajak, setPajak] = useState(true);
      const kirim = () => api<{ pesan: string }>('py_penyesuaian_simpan', { periode: p, userId: uid, nama: nama.trim(), jenis, nominal: nom, kenaPajak: pajak ? 1 : 0 })
        .then((r) => { tutupSheet(); toast(r.pesan); segarkan(); }).catch(galat);
      return (<>
        <h3><Ikon n="plus" />Tambah Penyesuaian — {periodeTeks(p)}</h3>
        <div className="note">Untuk bonus, THR, honor juri/panitia olimpiade, insentif, atau koreksi potongan. Slip karyawan dihitung ulang otomatis.</div>
        <label>Karyawan</label><select value={uid} onChange={(e) => setUid(+e.target.value)}>{s.map((x) => <option key={x.userId} value={x.userId}>{x.nama}</option>)}</select>
        <label>Keterangan</label><input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Honor Juri OSN Provinsi" />
        <div className="row"><div><label>Jenis</label><select value={jenis} onChange={(e) => setJenis(e.target.value)}>
          <option value="tunjangan">Tambahan pendapatan</option><option value="potongan">Potongan</option></select></div>
          <div><label>Nominal</label><InputUang nilai={nom} ubah={setNom} /></div></div>
        {jenis === 'tunjangan' && <Sakelar on={pajak} ubah={setPajak} judul="Kena PPh 21" ket="Bonus, THR, honor & insentif umumnya kena pajak" />}
        <button className="btn" onClick={kirim}><Ikon n="check" />Simpan</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  const hapusAdj = async (id: number) => {
    if (!(await yakin('Hapus penyesuaian ini?'))) return;
    api<{ pesan: string }>('py_penyesuaian_hapus', { id }).then((r) => { toast(r.pesan); segarkan(); }).catch(galat);
  };
  const eksporDetail = () => keExcel(s.map((x) => {
    const o: Data = { NIK: x.nik, Nama: x.nama, Jabatan: x.jabatan, Divisi: x.dept, Lokasi: x.cabang, PTKP: x.ptkp, NPWP: x.npwp,
      'Hari Hadir': x.hariHadir, 'Hari Mangkir': x.hariMangkir, Prorata: x.prorata };
    for (const b of x.rincian?.baris ?? []) { const k = (b.jenis === 'info' ? '[Perusahaan] ' : b.jenis === 'potongan' ? '[−] ' : '[+] ') + b.nama; o[k] = (o[k] || 0) + b.nominal; }
    Object.assign(o, { 'Total Pendapatan': x.totalPendapatan, 'Total Potongan': x.totalPotongan, 'Bruto Pajak': x.brutoPajak, 'PPh 21': x.pph21,
      'Metode PPh 21': x.pph21Metode, 'BPJS Perusahaan': x.bpjsPerusahaan, 'Take Home Pay': x.thp });
    return o;
  }), 'Payroll', 'payroll-' + p);
  const eksporTransfer = () => keExcel(s.map((x, n) => ({ No: n + 1, Nama: x.nama, Bank: x.bankNama, 'No Rekening': x.bankRekening,
    'Atas Nama': x.bankAtasNama || x.nama, Nominal: x.thp, Keterangan: 'Gaji ' + periodeTeks(p) })), 'Transfer', 'transfer-gaji-' + p);
  const kpi: [string, string, string | number, string][] = [['banknote', 'Total take home pay', rupiah(sum('thp')), ''], ['trending-up', 'Penghasilan bruto', rupiah(sum('brutoPajak')), 'c-cyan'],
    ['landmark', 'PPh 21 dipotong', rupiah(sum('pph21')), 'c-amber'], ['shield-check', 'BPJS ditanggung perusahaan', rupiah(sum('bpjsPerusahaan')), 'c-green'], ['users', 'Karyawan dibayar', s.length, 'c-gray']];
  return (<>
    <div className="kpis">{kpi.map(([ic, k, v, w]) => <div key={k} className={'kpi ' + w}><div className="ico"><Ikon n={ic} /></div><div className="v" style={{ fontSize: 22 }}>{v}</div><div className="k">{k}</div></div>)}</div>
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}>
        <h3 style={{ margin: 0 }}><Ikon n="file-spreadsheet" />Slip {periodeTeks(p)} {final ? <span className="badge b-green"><Ikon n="lock" />Final oleh {per.finalOleh}</span>
          : <span className="badge b-amber">Draf — belum terlihat karyawan</span>}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!final && <><button className="btn ghost sm auto" onClick={() => hitung(p)}><Ikon n="repeat" />Hitung ulang</button>
            <button className="btn ghost sm auto" disabled={!s.length} onClick={penyesuaian}><Ikon n="plus" />Penyesuaian</button>
            <button className="btn green sm auto" disabled={!s.length} onClick={finalkan}><Ikon n="lock" />Finalkan</button></>}
          {final && <button className="btn ghost sm auto" onClick={buka}><Ikon n="undo-2" />Buka kembali</button>}
          <button className="btn ghost sm auto" disabled={!s.length} onClick={eksporDetail}><Ikon n="download" />Excel detail</button>
          <button className="btn ghost sm auto" disabled={!s.length} onClick={eksporTransfer}><Ikon n="landmark" />Daftar transfer</button>
        </div></div>
      {s.length ? (
        <div className="tblwrap"><table><thead><tr><th>Karyawan</th><th className="r">Gaji pokok</th><th className="r">Pendapatan</th><th className="r">Potongan</th>
          <th className="r">PPh 21</th><th className="r">THP</th><th>Hadir</th><th>Rekening</th><th /></tr></thead><tbody>
          {s.map((x) => (
            <tr key={x.id}><td><div className="orang"><Avatar u={x} ukuran={32} /><div><b>{x.nama}</b><div className="tiny muted">{x.jabatan} · {x.ptkp}</div></div></div></td>
              <td className="r num">{rupiah(x.gajiPokok)}{x.prorata < 1 && <div className="tiny muted">prorata {Math.round(x.prorata * 100)}%</div>}</td>
              <td className="r num">{rupiah(x.totalPendapatan)}</td><td className="r num">{rupiah(x.totalPotongan)}</td>
              <td className="r num">{rupiah(x.pph21)}<div className="tiny muted">{x.pph21Metode}</div></td>
              <td className="r num"><b>{rupiah(x.thp)}</b></td>
              <td>{x.hariHadir}{x.hariMangkir > 0 && <> <span className="badge b-red">{x.hariMangkir} mangkir</span></>}</td>
              <td className="tiny">{x.bankRekening ? <>{x.bankNama}<div className="muted">{x.bankRekening}</div></> : <span className="badge b-red">belum ada</span>}</td>
              <td><button className="btn ghost sm auto" title="Lihat slip" onClick={() => lihatSlip(x.id)}><Ikon n="eye" /></button></td></tr>))}
        </tbody></table></div>) : <div className="empty">Tidak ada slip. Pastikan data gaji karyawan terisi.</div>}
      {d.penyesuaian.length > 0 && <>
        <h3 style={{ marginTop: 18 }}><Ikon n="pencil" />Penyesuaian periode ini</h3>
        {d.penyesuaian.map((a: Data) => (
          <div key={a.id} className="item"><div className="top">
            <div><b>{a.karyawan}</b> · {a.nama}<div className="tiny muted">{a.jenis === 'tunjangan' ? 'tambahan' + (a.kenaPajak ? ' · kena pajak' : ' · tidak kena pajak') : 'potongan'} · oleh {a.oleh}</div></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <b className="num" style={{ color: a.jenis === 'tunjangan' ? 'var(--success)' : 'var(--danger)' }}>{a.jenis === 'tunjangan' ? '+' : '−'}{rupiah(a.nominal)}</b>
              {!final && <button className="btn ghost sm auto" title="Hapus" onClick={() => hapusAdj(a.id)}><Ikon n="trash-2" /></button>}</div>
          </div></div>))}</>}
    </div>
  </>);
}

/* ---------------- DATA GAJI ---------------- */
function TabGaji() {
  const { galat, toast, bukaSheet, tutupSheet } = useAplikasi();
  const [gaji, setGaji] = useState<Data[] | null>(null), [komp, setKomp] = useState<Data[]>([]), [cari, setCari] = useState('');
  const muat = useCallback(() => {
    Promise.all([api<Data[]>('py_gaji_daftar', {}, true), api<Data[]>('py_komponen', {}, true)]).then(([g, k]) => { setGaji(g); setKomp(k); }).catch(galat);
  }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const aktifK = komp.filter((k) => k.aktif);
  const belum = (gaji ?? []).filter((g) => !g.terdaftar && g.role !== 'direktur').length;
  const tampil = useMemo(() => (gaji ?? []).filter((g) => (g.nama + ' ' + g.nik).toLowerCase().includes(cari.toLowerCase())), [gaji, cari]);
  const ubah = (g: Data) => {
    function Form() {
      const [pokok, setPokok] = useState<number>(g.gajiPokok), [ptkp, setPtkp] = useState<string>(g.ptkp);
      const [nilaiK, setNilaiK] = useState<Record<number, number>>(() => Object.fromEntries(aktifK.map((k) => [k.id, g.komponen[k.id] || 0])));
      const [kes, setKes] = useState<boolean>(g.ikutBpjsKes), [tk, setTk] = useState<boolean>(g.ikutBpjsTk), [jp, setJp] = useState<boolean>(g.ikutJp);
      const [pph, setPph] = useState<boolean>(g.kenaPph21), [lembur, setLembur] = useState<boolean>(g.dapatLembur), [dasar, setDasar] = useState<number>(g.dasarBpjs ?? 0);
      const kirim = () => api<{ pesan: string }>('py_gaji_simpan', { userId: g.id, gajiPokok: pokok, ptkp, komponen: nilaiK, ikutBpjsKes: +kes, ikutBpjsTk: +tk,
        ikutJp: +jp, kenaPph21: +pph, dapatLembur: +lembur, dasarBpjs: dasar || '' }).then((r) => { tutupSheet(); toast(r.pesan); muat(); }).catch(galat);
      return (<>
        <h3><Ikon n="calculator" />Gaji — {g.nama}</h3>
        <div className="row"><div><label>Gaji pokok / bulan</label><InputUang nilai={pokok} ubah={setPokok} autoFocus /></div>
          <div><label>Status PTKP</label><select value={ptkp} onChange={(e) => setPtkp(e.target.value)}>{PTKP.map((x) => <option key={x}>{x}</option>)}</select></div></div>
        <div className="tiny muted" style={{ marginTop: 4 }}>TK = tidak kawin, K = kawin, angka = jumlah tanggungan (maks 3). Menentukan kategori TER A/B/C.</div>
        {aktifK.length > 0 && <h3 style={{ marginTop: 18 }}><Ikon n="layers" />Komponen tetap</h3>}
        {aktifK.map((k) => <div key={k.id}><label>{k.nama} <span className="tiny">({k.jenis}{k.hitung === 'per_hadir' ? ', per hari hadir' : ', per bulan'})</span></label>
          <InputUang nilai={nilaiK[k.id]} ubah={(n) => setNilaiK({ ...nilaiK, [k.id]: n })} /></div>)}
        <h3 style={{ marginTop: 18 }}><Ikon n="shield-check" />BPJS, pajak & lembur</h3>
        <Sakelar on={kes} ubah={setKes} judul="BPJS Kesehatan" ket="4% perusahaan + 1% karyawan" />
        <Sakelar on={tk} ubah={setTk} judul="BPJS Ketenagakerjaan (JHT, JKK, JKM)" ket="JHT 3,7% + 2%; JKK & JKM ditanggung perusahaan" />
        <Sakelar on={jp} ubah={setJp} judul="Jaminan Pensiun" ket="2% perusahaan + 1% karyawan, dengan batas upah" />
        <Sakelar on={pph} ubah={setPph} judul="Potong PPh 21" ket="Metode gross — pajak ditanggung karyawan" />
        <Sakelar on={lembur} ubah={setLembur} judul="Mendapat upah lembur" ket="Matikan untuk jabatan manajerial" />
        <label>Dasar upah BPJS khusus <span className="tiny">(kosongkan = gaji pokok + tunjangan tetap)</span></label><InputUang nilai={dasar} ubah={setDasar} />
        <button className="btn" onClick={kirim}><Ikon n="check" />Simpan</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  return (
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="users" />Data Gaji Karyawan</h3>
        <input placeholder="Cari nama…" style={{ width: 220 }} value={cari} onChange={(e) => setCari(e.target.value)} /></div>
      {belum > 0 && <div className="warn" style={{ marginTop: 12 }}>{belum} karyawan belum punya data gaji dan belum ikut payroll.</div>}
      {!gaji ? <div className="skel" style={{ height: 160, marginTop: 12 }} /> : (
        <div className="tblwrap"><table><thead><tr><th>Karyawan</th><th>PTKP</th><th className="r">Gaji pokok</th>
          {aktifK.map((k) => <th key={k.id} className="r">{k.nama}{k.hitung === 'per_hadir' && <div className="tiny">/hari</div>}</th>)}
          <th>BPJS</th><th>Rekening</th><th /></tr></thead><tbody>
          {tampil.map((g) => (
            <tr key={g.id}><td><div className="orang"><Avatar u={g} ukuran={32} /><div><b>{g.nama}</b><div className="tiny muted">{g.jabatan} · {g.statusKerja}</div></div></div></td>
              <td>{g.terdaftar ? g.ptkp : '—'}</td>
              <td className="r num">{g.terdaftar ? rupiah(g.gajiPokok) : <span className="badge b-amber">belum diisi</span>}</td>
              {aktifK.map((k) => <td key={k.id} className="r num">{g.komponen[k.id] ? rupiah(g.komponen[k.id]) : <span className="muted">—</span>}</td>)}
              <td className="tiny">{g.terdaftar ? [g.ikutBpjsKes && 'Kes', g.ikutBpjsTk && 'TK', g.ikutJp && 'JP'].filter(Boolean).join(' · ') || 'tidak ikut' : '—'}</td>
              <td className="tiny">{g.bankRekening ? `${g.bankNama} ${g.bankRekening}` : <span className="badge b-red">kosong</span>}</td>
              <td><button className="btn ghost sm auto" onClick={() => ubah(g)}><Ikon n="pencil" />Atur</button></td></tr>))}
        </tbody></table></div>)}
      <div className="tiny muted" style={{ marginTop: 8 }}>Perubahan gaji tercatat di log aktivitas beserta nilai lama & baru.</div>
    </div>
  );
}

/* ---------------- KOMPONEN ---------------- */
function TabKomponen() {
  const { galat, toast, bukaSheet, tutupSheet } = useAplikasi();
  const [l, setL] = useState<Data[] | null>(null);
  const muat = useCallback(() => { api<Data[]>('py_komponen', {}, true).then(setL).catch(galat); }, [galat]);
  useEffect(() => { muat(); }, [muat]);
  const ubah = (k: Data | null) => {
    const a = k ?? { id: 0, kode: '', nama: '', jenis: 'tunjangan', hitung: 'bulanan', kenaPajak: true, masukBpjs: false, aktif: true, urut: 50 };
    function Form() {
      const [v, setV] = useState<Data>(a);
      const set = (k2: string, x: unknown) => setV({ ...v, [k2]: x });
      const kirim = () => api<{ pesan: string }>('py_komponen_simpan', { ...v, nama: v.nama.trim(), kenaPajak: +v.kenaPajak, masukBpjs: +v.masukBpjs, aktif: +v.aktif, urut: +v.urut || 50 })
        .then((r) => { tutupSheet(); toast(r.pesan); muat(); }).catch(galat);
      return (<>
        <h3><Ikon n="layers" />{a.id ? 'Ubah' : 'Tambah'} Komponen</h3>
        <div className="row"><div><label>Kode</label><input value={v.kode} maxLength={12} placeholder="TKES" onChange={(e) => set('kode', e.target.value.toUpperCase())} /></div>
          <div style={{ flex: 2 }}><label>Nama</label><input value={v.nama} placeholder="Tunjangan Kesehatan" onChange={(e) => set('nama', e.target.value)} /></div></div>
        <div className="row"><div><label>Jenis</label><select value={v.jenis} onChange={(e) => set('jenis', e.target.value)}><option value="tunjangan">Tunjangan</option><option value="potongan">Potongan</option></select></div>
          <div><label>Perhitungan</label><select value={v.hitung} onChange={(e) => set('hitung', e.target.value)}><option value="bulanan">Bulanan (tetap)</option><option value="per_hadir">Per hari hadir</option></select></div></div>
        <Sakelar on={v.kenaPajak} ubah={(x) => set('kenaPajak', x)} judul="Kena PPh 21" />
        <Sakelar on={v.masukBpjs} ubah={(x) => set('masukBpjs', x)} judul="Masuk dasar BPJS & upah lembur" ket="Nyalakan untuk tunjangan tetap" />
        <Sakelar on={v.aktif} ubah={(x) => set('aktif', x)} judul="Aktif" />
        <label>Urutan tampil</label><input type="number" value={v.urut} onChange={(e) => set('urut', e.target.value)} />
        <button className="btn" onClick={kirim}><Ikon n="check" />Simpan</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  return (
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="layers" />Komponen Gaji</h3>
        <button className="btn sm auto" onClick={() => ubah(null)}><Ikon n="plus" />Tambah Komponen</button></div>
      <div className="note" style={{ marginTop: 12 }}><b>Masuk dasar BPJS</b> = tunjangan tetap (dipakai untuk iuran BPJS dan upah lembur).{' '}
        <b>Per hari hadir</b> = nominal × jumlah hari hadir di bulan itu (cocok untuk uang makan & transport).</div>
      {!l ? <div className="skel" style={{ height: 120, marginTop: 12 }} /> : (
        <div className="tblwrap"><table><thead><tr><th>Kode</th><th>Nama</th><th>Jenis</th><th>Perhitungan</th><th>Kena pajak</th><th>Dasar BPJS</th><th>Status</th><th /></tr></thead><tbody>
          {l.map((k) => (
            <tr key={k.id}><td><code>{k.kode}</code></td><td><b>{k.nama}</b></td>
              <td>{k.jenis === 'tunjangan' ? <span className="badge b-green">Tunjangan</span> : <span className="badge b-red">Potongan</span>}</td>
              <td>{k.hitung === 'per_hadir' ? 'Per hari hadir' : 'Bulanan'}</td><td>{k.kenaPajak ? <Ikon n="check" /> : '—'}</td><td>{k.masukBpjs ? <Ikon n="check" /> : '—'}</td>
              <td>{k.aktif ? <span className="badge b-green">Aktif</span> : <span className="badge b-gray">Nonaktif</span>}</td>
              <td><button className="btn ghost sm auto" title="Ubah" onClick={() => ubah(k)}><Ikon n="pencil" /></button></td></tr>))}
        </tbody></table></div>)}
    </div>
  );
}

/* ---------------- SALDO AWAL PAJAK ---------------- */
function TabSaldo() {
  const { galat, toast, bukaSheet, tutupSheet } = useAplikasi();
  const thIni = +todayStr().slice(0, 4);
  const [th, setTh] = useState(thIni), [l, setL] = useState<Data[] | null>(null), [orang, setOrang] = useState<Data[]>([]);
  const muat = useCallback(() => {
    Promise.all([api<Data[]>('py_saldo_awal', { tahun: th }, true), api<Data[]>('py_gaji_daftar', {}, true)]).then(([s, g]) => { setL(s); setOrang(g); }).catch(galat);
  }, [th, galat]);
  useEffect(() => { muat(); }, [muat]);
  const ubah = (x: Data | null) => {
    const a = x ?? { userId: orang[0]?.id ?? 0, bulan: 0, bruto: 0, pph21: 0, iuran: 0 };
    function Form() {
      const [v, setV] = useState<Data>(a);
      const set = (k: string, n: unknown) => setV({ ...v, [k]: n });
      const kirim = () => api<{ pesan: string }>('py_saldo_awal_simpan', { ...v, tahun: th }).then((r) => { tutupSheet(); toast(r.pesan); muat(); }).catch(galat);
      return (<>
        <h3><Ikon n="history" />Saldo Awal Pajak {th}</h3>
        <label>Karyawan</label><select value={v.userId} disabled={!!x} onChange={(e) => set('userId', +e.target.value)}>{orang.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}</select>
        <label>Jumlah bulan yang sudah dibayar di luar aplikasi</label><input type="number" min={0} max={11} value={v.bulan} onChange={(e) => set('bulan', +e.target.value)} />
        <label>Total penghasilan bruto</label><InputUang nilai={v.bruto} ubah={(n) => set('bruto', n)} />
        <label>Total PPh 21 sudah dipotong</label><InputUang nilai={v.pph21} ubah={(n) => set('pph21', n)} />
        <label>Total iuran JHT + JP pegawai</label><InputUang nilai={v.iuran} ubah={(n) => set('iuran', n)} />
        <button className="btn" onClick={kirim}><Ikon n="check" />Simpan</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  return (
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="history" />Saldo Awal Pajak {th}</h3>
        <div style={{ display: 'flex', gap: 8 }}><select style={{ width: 'auto' }} value={th} onChange={(e) => setTh(+e.target.value)}>
          {[thIni - 1, thIni, thIni + 1].map((t) => <option key={t}>{t}</option>)}</select>
          <button className="btn sm auto" disabled={!orang.length} onClick={() => ubah(null)}><Ikon n="plus" />Isi Saldo</button></div></div>
      <div className="note" style={{ marginTop: 12 }}>Bila aplikasi mulai dipakai di tengah tahun, isi total <b>penghasilan bruto</b>, <b>PPh 21 yang sudah dipotong</b>, dan{' '}
        <b>iuran JHT + JP pegawai</b> dari bulan-bulan sebelumnya (dari sistem/Excel lama). Angka ini dipakai saat menghitung PPh 21 Desember agar hasil setahun tepat.</div>
      {!l ? <div className="skel" style={{ height: 90, marginTop: 12 }} /> : l.length ? (
        <div className="tblwrap"><table><thead><tr><th>Karyawan</th><th className="r">Bulan</th><th className="r">Bruto</th><th className="r">PPh 21</th><th className="r">Iuran JHT+JP</th><th /></tr></thead><tbody>
          {l.map((x) => (
            <tr key={x.userId}><td><b>{x.nama}</b> <span className="tiny muted">{x.nik}</span></td><td className="r">{x.bulan}</td>
              <td className="r num">{rupiah(x.bruto)}</td><td className="r num">{rupiah(x.pph21)}</td><td className="r num">{rupiah(x.iuran)}</td>
              <td><button className="btn ghost sm auto" title="Ubah" onClick={() => ubah(x)}><Ikon n="pencil" /></button></td></tr>))}
        </tbody></table></div>) : <div className="empty">Belum ada saldo awal untuk {th}.</div>}
    </div>
  );
}

/* ---------------- TARIF ---------------- */
function TabTarif() {
  const { galat, toast } = useAplikasi();
  const [s, setS] = useState<Data | null>(null);
  useEffect(() => { api<Data>('py_setelan', {}, true).then(setS).catch(galat); }, [galat]);
  if (!s) return <div className="card"><div className="skel" style={{ height: 240 }} /></div>;
  const set = (k: string, v: unknown) => setS({ ...s, [k]: v });
  const f = (k: string, judul: string, ket = '', langkah = '0.01') => (
    <div><label>{judul}</label><input type="number" step={langkah} value={s[k]} onChange={(e) => set(k, e.target.value)} />
      {ket && <div className="tiny muted" style={{ marginTop: 3 }}>{ket}</div>}</div>);
  const simpan = () => api<{ pesan: string; setelan: Data }>('py_setelan_simpan', s).then((r) => { toast(r.pesan); setS(r.setelan); }).catch(galat);
  return (
    <div className="card"><h3><Ikon n="sliders-horizontal" />Tarif BPJS, Lembur & Kebijakan Payroll</h3>
      <div className="warn">Nilai bawaan mengikuti aturan per September 2026. Batas upah Jaminan Pensiun diperbarui BPJS setiap Maret — periksa ulang setiap tahun.</div>
      <h3 style={{ marginTop: 18 }}>BPJS Kesehatan</h3>
      <div className="grid-3" style={{ gap: 12 }}>{f('bpjs_kes_p', 'Perusahaan (%)')}{f('bpjs_kes_k', 'Karyawan (%)')}{f('bpjs_kes_batas', 'Batas upah (Rp)', '', '1000')}</div>
      <h3 style={{ marginTop: 18 }}>BPJS Ketenagakerjaan</h3>
      <div className="grid-3" style={{ gap: 12 }}>{f('jht_p', 'JHT perusahaan (%)')}{f('jht_k', 'JHT karyawan (%)')}{f('jkk', 'JKK (%)', '0,24–1,74% sesuai tingkat risiko')}
        {f('jkm', 'JKM (%)')}{f('jp_p', 'JP perusahaan (%)')}{f('jp_k', 'JP karyawan (%)')}{f('jp_batas', 'Batas upah JP (Rp)', 'Mulai Maret 2026: 11.086.300', '1')}</div>
      <h3 style={{ marginTop: 18 }}>Lembur & kehadiran</h3>
      <div className="grid-3" style={{ gap: 12 }}>{f('lembur_pembagi', 'Pembagi upah sejam', 'PP 35/2021: 1/173', '1')}{f('hari_kerja_sebulan', 'Hari kerja per bulan', 'untuk potongan tidak hadir', '1')}
        <div><label>Potong gaji bila mangkir</label><select value={String(s.potong_mangkir ? 1 : 0)} onChange={(e) => set('potong_mangkir', +e.target.value)}>
          <option value="0">Tidak</option><option value="1">Ya — (gaji pokok + tunjangan tetap) ÷ hari kerja × hari mangkir</option></select></div></div>
      <label>Catatan kaki slip gaji</label><input value={s.slip_catatan} onChange={(e) => set('slip_catatan', e.target.value)} />
      <button className="btn" onClick={simpan}><Ikon n="check" />Simpan Pengaturan Payroll</button>
    </div>
  );
}
