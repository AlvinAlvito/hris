'use client';
/* Pengumuman & kalender libur (semua pengguna). HC juga bisa membuat pengumuman dan mengelola libur di sini. */
import { useCallback, useEffect, useState } from 'react';
import { isAdminUp, useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { ItemPengumuman, useBukaPengumuman } from '@/components/Pengumuman';
import { api } from '@/lib/klien/api';
import { NAMA_BULAN, NAMA_HARI, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const JENIS_LIBUR: Record<string, [string, string]> = { nasional: ['Libur nasional', 'b-red'], cuti_bersama: ['Cuti bersama', 'b-amber'], perusahaan: ['Libur organisasi', 'b-purple'] };

export default function Informasi() {
  const { me, galat } = useAplikasi();
  const admin = isAdminUp(me);
  const [info, setInfo] = useState<Data | null>(null);
  const [kelola, setKelola] = useState<Data[] | null>(null);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [libur, setLibur] = useState<Data[] | null>(null);
  const buka = useBukaPengumuman(setInfo);

  const muatPeng = useCallback(() => {
    api<Data>('info_beranda', {}, true).then(setInfo).catch(galat);
    if (admin) api<Data[]>('info_pengumuman', {}, true).then(setKelola).catch(galat);
  }, [admin, galat]);
  const muatLibur = useCallback(() => { api<Data[]>('info_libur', { tahun }, true).then(setLibur).catch(galat); }, [tahun, galat]);
  useEffect(() => { muatPeng(); }, [muatPeng]);
  useEffect(() => { muatLibur(); }, [muatLibur]);

  return (
    <div className="grid-2">
      <div>
        {admin ? <KelolaPengumuman list={kelola} muat={muatPeng} />
          : <div className="card"><h3><Ikon n="megaphone" />Pengumuman</h3>
            {!info ? <div className="skel" style={{ height: 60 }} /> : info.pengumuman.length
              ? info.pengumuman.map((p: Data) => <ItemPengumuman key={p.id} p={p} buka={() => buka(p)} />)
              : <div className="empty"><Ikon n="megaphone" />Belum ada pengumuman.</div>}</div>}
      </div>
      <div>
        <div className="card">
          <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="calendar-days" />Kalender Libur</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={{ width: 'auto' }} value={tahun} onChange={(e) => setTahun(+e.target.value)}>
                {[-1, 0, 1].map((x) => { const t = new Date().getFullYear() + x; return <option key={t}>{t}</option>; })}</select>
              {admin && <TombolTambahLibur selesai={muatLibur} />}
            </div></div>
          {!libur ? <div className="skel" style={{ height: 80, marginTop: 12 }} /> : libur.length ? libur.map((x) => (
            <ItemLibur key={x.id} x={x} admin={admin} selesai={muatLibur} />
          )) : <div className="empty">Belum ada hari libur tercatat untuk tahun ini.</div>}
        </div>
      </div>
    </div>
  );
}

function ItemLibur({ x, admin, selesai }: { x: Data; admin: boolean; selesai: () => void }) {
  const { yakin, toast, galat } = useAplikasi();
  const lewat = x.tanggal < todayStr(), d = new Date(x.tanggal + 'T00:00:00');
  const hapus = async () => {
    if (!(await yakin('Hapus hari libur ini?', 'Tanggal tersebut kembali menjadi hari kerja.'))) return;
    api<{ pesan: string }>('info_libur_hapus', { id: x.id }).then((r) => { toast(r.pesan); selesai(); }).catch(galat);
  };
  return (
    <div className="item" style={{ opacity: lewat ? 0.55 : 1 }}>
      <div className="top"><div className="orang">
        <div style={{ width: 46, textAlign: 'center', borderRadius: 12, background: 'var(--surface-3)', padding: '5px 0', flex: '0 0 auto' }}>
          <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1 }}>{d.getDate()}</div><div className="tiny muted">{NAMA_BULAN[d.getMonth()].slice(0, 3)}</div></div>
        <div><b>{x.nama}</b><div className="tiny muted">{NAMA_HARI[d.getDay()]}</div></div></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={'badge ' + JENIS_LIBUR[x.jenis][1]}>{JENIS_LIBUR[x.jenis][0]}</span>
          {admin && <button className="btn ghost sm auto" onClick={hapus} title="Hapus"><Ikon n="trash-2" /></button>}
        </div></div>
    </div>
  );
}

function TombolTambahLibur({ selesai }: { selesai: () => void }) {
  const { bukaSheet, tutupSheet, toast, galat } = useAplikasi();
  function Form() {
    const [tgl, setTgl] = useState(todayStr()), [nama, setNama] = useState(''), [jenis, setJenis] = useState('perusahaan');
    return (<>
      <h3><Ikon n="calendar-days" />Tambah Hari Libur</h3>
      <label>Tanggal</label><input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} />
      <label>Nama</label><input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Hari Jadi POSI" />
      <label>Jenis</label><select value={jenis} onChange={(e) => setJenis(e.target.value)}>
        <option value="perusahaan">Libur organisasi</option><option value="nasional">Libur nasional</option><option value="cuti_bersama">Cuti bersama</option></select>
      <button className="btn" onClick={() => api<{ pesan: string }>('info_libur_simpan', { tanggal: tgl, nama: nama.trim(), jenis })
        .then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat)}><Ikon n="check" />Simpan</button>
      <button className="btn ghost" onClick={tutupSheet}>Batal</button>
    </>);
  }
  return <button className="btn sm auto" onClick={() => bukaSheet(<Form />)}><Ikon n="plus" />Tambah</button>;
}

function KelolaPengumuman({ list, muat }: { list: Data[] | null; muat: () => void }) {
  const { bukaSheet, tutupSheet, yakin, toast, galat } = useAplikasi();
  const form = (p?: Data) => {
    function Form() {
      const [judul, setJudul] = useState(p?.judul ?? ''), [isi, setIsi] = useState(p?.isi ?? '');
      const [mulai, setMulai] = useState(p?.mulai ?? todayStr()), [sampai, setSampai] = useState(p?.sampai ?? '');
      const [cab, setCab] = useState<number>(p?.cabangId ?? 0), [penting, setPenting] = useState(!!p?.penting);
      const [cabang, setCabang] = useState<Data[]>([]);
      useEffect(() => { api<Data[]>('adm_cabang', {}, true).then(setCabang).catch(() => {}); }, []);
      return (<>
        <h3><Ikon n="megaphone" />{p ? 'Ubah' : 'Buat'} Pengumuman</h3>
        <label>Judul</label><input value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="mis. Jadwal Technical Meeting OSN" />
        <label>Isi</label><textarea style={{ minHeight: 140 }} value={isi} onChange={(e) => setIsi(e.target.value)} />
        <div className="row"><div><label>Tayang mulai</label><input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} /></div>
          <div><label>Sampai <span className="tiny">(opsional)</span></label><input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></div></div>
        <label>Untuk</label><select value={cab} onChange={(e) => setCab(+e.target.value)}>
          <option value={0}>Semua karyawan</option>{cabang.map((c) => <option key={c.id} value={c.id}>Hanya {c.nama}</option>)}</select>
        <div className="switch"><div><b>Tandai penting</b><div className="tiny muted">Tampil paling atas dengan tanda merah</div></div>
          <div className={'sw' + (penting ? ' on' : '')} onClick={() => setPenting(!penting)} /></div>
        <button className="btn" onClick={() => api<{ pesan: string }>('info_pengumuman_simpan', { id: p?.id ?? 0, judul, isi, mulai, sampai, cabangId: cab, penting: penting ? 1 : 0 })
          .then((r) => { tutupSheet(); toast(r.pesan); muat(); }).catch(galat)}><Ikon n="send" />{p ? 'Simpan' : 'Terbitkan'}</button>
        <button className="btn ghost" onClick={tutupSheet}>Batal</button>
      </>);
    }
    bukaSheet(<Form />);
  };
  const hapus = async (id: number) => {
    if (!(await yakin('Hapus pengumuman ini?'))) return;
    api<{ pesan: string }>('info_pengumuman_hapus', { id }).then((r) => { toast(r.pesan); muat(); }).catch(galat);
  };
  const hari = todayStr();
  return (
    <div className="card">
      <div className="page-head" style={{ margin: 0 }}><h3 style={{ margin: 0 }}><Ikon n="megaphone" />Pengumuman</h3>
        <button className="btn sm auto" onClick={() => form()}><Ikon n="plus" />Buat Pengumuman</button></div>
      {!list ? <div className="skel" style={{ height: 80, marginTop: 12 }} /> : list.length ? list.map((p) => {
        const aktif = p.mulai <= hari && (!p.sampai || p.sampai >= hari), persen = p.jumlahTarget ? Math.round((p.jumlahBaca / p.jumlahTarget) * 100) : 0;
        return (
          <div key={p.id} className="item">
            <div className="top"><div style={{ minWidth: 0 }}><div className="nm">{p.penting && <><Ikon n="circle-alert" /> </>}{p.judul}</div>
              <div className="dt">{tglPendek(p.mulai)}{p.sampai && ' – ' + tglPendek(p.sampai)} · {p.cabang || 'semua lokasi'}</div></div>
              <span className={'badge ' + (aktif ? 'b-green' : 'b-gray')}>{aktif ? 'Tayang' : 'Tidak tayang'}</span></div>
            <div className="tiny muted" style={{ marginTop: 6 }}>{p.isi.slice(0, 160)}{p.isi.length > 160 && '…'}</div>
            <div style={{ marginTop: 8 }}><div className="bar"><i style={{ width: persen + '%' }} /></div>
              <div className="tiny muted" style={{ marginTop: 3 }}>Dibaca {p.jumlahBaca} dari {p.jumlahTarget} orang ({persen}%)</div></div>
            <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
              <button className="btn ghost sm auto" onClick={() => form(p)}><Ikon n="pencil" />Ubah</button>
              <button className="btn ghost sm auto" onClick={() => hapus(p.id)}><Ikon n="trash-2" />Hapus</button></div>
          </div>);
      }) : <div className="empty"><Ikon n="megaphone" />Belum ada pengumuman.</div>}
    </div>
  );
}
