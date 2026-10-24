'use client';
/* Jadwal pegawai: kalender bulan, ganti shift / libur, tukar dengan rekan */
import { useCallback, useEffect, useState } from 'react';
import { useAplikasi } from '@/components/Aplikasi';
import { Ikon } from '@/components/Ikon';
import { api } from '@/lib/klien/api';
import { NAMA_BULAN, teksStatus, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const HARI = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
function Status({ st }: { st: string }) {
  const c = st === 'Disetujui' ? 'b-green' : /^Menunggu/.test(st) ? 'b-amber' : st === 'Dibatalkan' ? 'b-gray' : 'b-red';
  return <span className={'badge ' + c}>{teksStatus(st)}</span>;
}

export default function Jadwal() {
  const { me, bukaSheet, tanya, yakin, toast, galat, muatInbox } = useAplikasi();
  const kini = new Date();
  const [bl, setBl] = useState(kini.getMonth() + 1), [th, setTh] = useState(kini.getFullYear());
  const [d, setD] = useState<Data | null>(null), [ajuan, setAjuan] = useState<Data[]>([]);
  const muat = useCallback(() => {
    api<Data>('jadwal_saya', { bulan: bl, tahun: th }).then(setD).catch(galat);
    api<Data[]>('pengajuan_saya', {}, true).then((l) => setAjuan(l.filter((x) => x.jenis !== 'lembur'))).catch(() => {});
  }, [bl, th, galat]);
  useEffect(() => { muat(); }, [muat]);
  const selesai = () => { muat(); muatInbox(); };
  const shiftMode = me?.jamMode === 'shift', hariIni = todayStr();
  const hari: Data[] = d?.hari ?? [];
  const hitung: Record<string, number> = {};
  hari.forEach((h) => { if (h.shift) hitung[h.shift.nama] = (hitung[h.shift.nama] ?? 0) + 1; });
  const respon = async (id: number, setuju: boolean) => {
    const c = await tanya(setuju ? 'Catatan (opsional):' : 'Alasan menolak (opsional):', '');
    if (c === null) return;
    api<{ pesan: string }>('tukar_respon_rekan', { id, setuju: setuju ? 1 : 0, catatan: c }).then((r) => { toast(r.pesan); selesai(); }).catch(galat);
  };
  const batal = async (aksi: string, id: number) => {
    if (!(await yakin('Batalkan pengajuan ini?'))) return;
    api<{ pesan: string }>(aksi, { id }).then((r) => { toast(r.pesan); selesai(); }).catch(galat);
  };
  const perluRespon = (d?.tukar ?? []).filter((x: Data) => x.status === 'Menunggu Rekan' && x.rekanId === me?.id);

  return (
    <div className="sempit">
      <div className="card"><h3><Ikon n="calendar-days" />Jadwal Saya</h3>
        <div className="row">
          <div><label style={{ marginTop: 0 }}>Bulan</label><select value={bl} onChange={(e) => setBl(+e.target.value)}>{NAMA_BULAN.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></div>
          <div><label style={{ marginTop: 0 }}>Tahun</label><select value={th} onChange={(e) => setTh(+e.target.value)}>{[-1, 0, 1].map((x) => <option key={x}>{kini.getFullYear() + x}</option>)}</select></div></div>
        <div className="statgrid g3">
          <div className="stat"><div className="k">Hari Kerja</div><div className="v">{hari.filter((h) => !h.libur && (h.shift || !shiftMode)).length}</div></div>
          <div className="stat"><div className="k">Libur</div><div className="v">{hari.filter((h) => h.libur).length}</div></div>
          {Object.entries(hitung).map(([n, v]) => <div key={n} className="stat"><div className="k">{n}</div><div className="v">{v}</div></div>)}
          {!shiftMode && <div className="stat"><div className="k">Pola Jam</div><div className="v" style={{ fontSize: 15 }}>{me?.jamMode === 'fleksibel' ? 'Fleksibel' : 'Tetap'}</div></div>}
        </div>
      </div>

      <div className="card"><h3><Ikon n="send" />Ajukan Perubahan</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {shiftMode && <button className="btn sm" onClick={() => d && bukaSheet(<FormJadwal jenis="ganti_shift" d={d} selesai={selesai} />)}><Ikon n="repeat" />Ganti Shift</button>}
          <button className="btn sm ghost" onClick={() => d && bukaSheet(<FormJadwal jenis="libur" d={d} selesai={selesai} />)}><Ikon n="plane" />Libur / Pindah Libur</button></div>
        {ajuan.map((x) => (
          <div key={x.id} className="item"><div className="top"><div><div className="nm">{x.jenisLabel}</div>
            <div className="dt">{tglPendek(x.tanggal)} · {x.jenis === 'ganti_shift' ? <>{x.jadwalSebelum} → <b>{x.jadwalSesudah}</b></> : <>Jadi LIBUR{x.tanggal2 && ', dipindah ke ' + tglPendek(x.tanggal2)}</>}</div></div>
            <Status st={x.status} /></div>
            {x.catatanHr && <div className="kv"><span>Catatan HC</span><span style={{ textAlign: 'right' }}>{x.catatanHr}</span></div>}
            {/^Menunggu/.test(x.status) && <button className="btn ghost sm auto" style={{ marginTop: 8 }} onClick={() => batal('pengajuan_batal', x.id)}>Batalkan</button>}</div>))}
      </div>

      {shiftMode && (
        <div className="card"><h3><Ikon n="arrow-left-right" />Tukar Shift / Libur</h3>
          {perluRespon.length ? <div className="warn"><b>{perluRespon.length} permintaan tukar menunggu jawaban Anda.</b></div>
            : <div className="note">Tukar shift atau libur dengan rekan satu lokasi kerja. Perlu persetujuan rekan, lalu HC.</div>}
          <button className="btn" onClick={() => d && bukaSheet(<FormTukar d={d} bl={bl} th={th} selesai={selesai} />)}><Ikon n="arrow-left-right" />Ajukan Tukar</button>
          {(d?.tukar ?? []).map((x: Data) => {
            const saya = x.pemohonId === me?.id;
            return (
              <div key={x.id} className="item"><div className="top"><div>
                <div className="nm">{saya ? 'Saya ↔ ' + x.rekan : x.pemohon + ' ↔ Saya'}</div>
                <div className="dt">{x.jenis === 'libur' ? 'Tukar libur' : 'Tukar shift'} · {tglPendek(x.tglPemohon)} ({x.shiftPemohonSebelum}) ↔ {tglPendek(x.tglRekan)} ({x.shiftRekanSebelum})</div></div>
                <Status st={x.status} /></div>
                <div className="kv"><span>Alasan</span><span style={{ textAlign: 'right' }}>{x.alasan}</span></div>
                {x.catatanHr && <div className="kv"><span>Catatan HC</span><span style={{ textAlign: 'right' }}>{x.catatanHr}</span></div>}
                {x.status === 'Menunggu Rekan' && !saya && <div className="row" style={{ marginTop: 9 }}>
                  <button className="btn sm green" onClick={() => respon(x.id, true)}><Ikon n="check" />Setuju</button>
                  <button className="btn sm red" onClick={() => respon(x.id, false)}><Ikon n="x" />Tolak</button></div>}
                {saya && /^Menunggu/.test(x.status) && <button className="btn ghost sm auto" style={{ marginTop: 8 }} onClick={() => batal('tukar_batal', x.id)}>Batalkan</button>}
              </div>);
          })}
        </div>)}

      <div className="card"><h3><Ikon n="list-checks" />Daftar Hari</h3>
        {!d ? <div className="skel" style={{ height: 160 }} /> : hari.map((h) => (
          <div key={h.tanggal} className="kv" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)', ...(h.tanggal === hariIni ? { background: 'var(--sky-soft)', borderRadius: 8, paddingLeft: 8, paddingRight: 8 } : {}) }}>
            <span style={{ color: 'var(--ink)' }}><b>{+h.tanggal.slice(8)}</b> {HARI[h.dow]}{h.tanggal === hariIni && <span className="tiny" style={{ color: 'var(--primary)' }}> hari ini</span>}</span>
            <span style={{ textAlign: 'right' }}>
              {h.libur ? <span className="badge b-red">LIBUR</span>
                : h.shift ? <><span className="badge b-blue">{h.shift.nama}</span> <span className="tiny muted">{h.shift.jamMasuk}–{h.shift.jamPulang}</span></>
                  : me?.jamMode === 'fleksibel' ? <><span className="badge b-green">Fleksibel</span> <span className="tiny muted">target {(me.targetMenit / 60)} jam</span></>
                    : me?.jamMode === 'tetap' ? <><span className="badge b-gray">Kerja</span> <span className="tiny muted">{d.jamKantor.masuk}–{d.jamKantor.pulang}</span></>
                      : <span className="badge b-gray">belum diatur</span>}
              {h.sudahAbsen && <span className="tiny muted"> sudah absen</span>}</span>
          </div>))}
      </div>
    </div>
  );
}

function FormJadwal({ jenis, d, selesai }: { jenis: 'ganti_shift' | 'libur'; d: Data; selesai: () => void }) {
  const { me, tutupSheet, toast, galat } = useAplikasi();
  const [shift, setShift] = useState<Data[]>([]);
  useEffect(() => { if (jenis === 'ganti_shift') api<Data[]>('adm_shift', {}, true).then((l) => setShift(l.filter((x) => x.aktif))).catch(() => {}); }, [jenis]);
  const hariDepan = (d.hari as Data[]).filter((h) => h.tanggal >= todayStr() && !h.sudahAbsen);
  const label = (h: Data) => `${tglPendek(h.tanggal)} — ${h.libur ? 'LIBUR' : h.shift ? h.shift.nama : me?.jamMode === 'fleksibel' ? 'Fleksibel' : 'Kerja'}`;
  const [tgl, setTgl] = useState(hariDepan[0]?.tanggal ?? ''), [tgl2, setTgl2] = useState(''), [sh, setSh] = useState(0), [alasan, setAlasan] = useState('');
  const kirim = () => api<{ pesan: string }>('pengajuan_ajukan', { jenis, tanggal: tgl, tanggal2: tgl2, shiftId: sh || shift[0]?.id, alasan: alasan.trim() })
    .then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat);
  return (<>
    <h3>{jenis === 'ganti_shift' ? 'Ajukan Ganti Shift' : 'Ajukan Libur / Pindah Libur'}</h3>
    <label>Tanggal</label><select value={tgl} onChange={(e) => setTgl(e.target.value)}>{hariDepan.map((h) => <option key={h.tanggal} value={h.tanggal}>{label(h)}</option>)}</select>
    {jenis === 'ganti_shift' ? (<><label>Minta diganti ke shift</label>
      <select value={sh} onChange={(e) => setSh(+e.target.value)}>{shift.map((x) => <option key={x.id} value={x.id}>{x.nama} ({x.jamMasuk}–{x.jamPulang})</option>)}</select></>)
      : me?.jamMode === 'shift' ? (<><label>Pindahkan jadwalnya ke tanggal <span className="tiny">(opsional)</span></label>
        <select value={tgl2} onChange={(e) => setTgl2(e.target.value)}><option value="">— tidak dipindah —</option>
          {hariDepan.map((h) => <option key={h.tanggal} value={h.tanggal}>{label(h)}</option>)}</select></>)
        : <div className="tiny muted" style={{ marginTop: 4 }}>Untuk cuti tahunan atau izin, gunakan menu Pengajuan. Menu ini hanya mengubah jadwal kerja menjadi libur.</div>}
    <label>Alasan</label><textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. ada keperluan keluarga" />
    <button className="btn" onClick={kirim}><Ikon n="send" />Kirim ke HC</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}

function FormTukar({ d, bl, th, selesai }: { d: Data; bl: number; th: number; selesai: () => void }) {
  const { tutupSheet, toast, galat } = useAplikasi();
  const hariSaya = (d.hari as Data[]).filter((h) => h.tanggal >= todayStr() && !h.sudahAbsen);
  const [t1, setT1] = useState(hariSaya[0]?.tanggal ?? ''), [rid, setRid] = useState(0), [hariRekan, setHariRekan] = useState<Data[] | null>(null);
  const [t2, setT2] = useState(''), [alasan, setAlasan] = useState('');
  useEffect(() => {
    if (!rid) { setHariRekan(null); return; }
    api<Data>('jadwal_rekan', { rekanId: rid, bulan: bl, tahun: th }, true).then((x) => {
      const l = x.hari.filter((h: Data) => !h.sudahAbsen); setHariRekan(l); setT2(l[0]?.tanggal ?? '');
    }).catch(galat);
  }, [rid, bl, th, galat]);
  if (!d.rekan.length) return (<><h3>Ajukan Tukar</h3><div className="empty">Belum ada rekan bermode shift di lokasi kerja Anda.</div><button className="btn ghost" onClick={tutupSheet}>Tutup</button></>);
  const kirim = () => {
    if (!rid || !t2) { toast('Pilih rekan dan tanggalnya', true); return; }
    api<{ pesan: string }>('tukar_ajukan', { rekanId: rid, tglSaya: t1, tglRekan: t2, alasan: alasan.trim() }).then((r) => { tutupSheet(); toast(r.pesan); selesai(); }).catch(galat);
  };
  return (<>
    <h3>Ajukan Tukar Shift / Libur</h3>
    <label>Tanggal saya yang ingin ditukar</label><select value={t1} onChange={(e) => setT1(e.target.value)}>
      {hariSaya.map((h) => <option key={h.tanggal} value={h.tanggal}>{tglPendek(h.tanggal)} — {h.libur ? 'LIBUR' : h.shift?.nama ?? 'belum diatur'}</option>)}</select>
    <label>Tukar dengan rekan</label><select value={rid} onChange={(e) => setRid(+e.target.value)}><option value={0}>— pilih rekan —</option>
      {d.rekan.map((r: Data) => <option key={r.id} value={r.id}>{r.nama} ({r.jabatan || ''})</option>)}</select>
    {hariRekan && (<><label>Tanggal rekan yang diambil</label><select value={t2} onChange={(e) => setT2(e.target.value)}>
      {hariRekan.length ? hariRekan.map((h) => <option key={h.tanggal} value={h.tanggal}>{tglPendek(h.tanggal)} — {h.libur ? 'LIBUR' : h.shift || 'belum diatur'}</option>)
        : <option value="">tidak ada tanggal tersedia</option>}</select></>)}
    <label>Alasan</label><textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. ada acara keluarga" />
    <div className="note">Permintaan dikirim ke rekan Anda dulu. Setelah ia setuju, HC yang memutuskan.</div>
    <button className="btn" onClick={kirim}>Kirim Permintaan</button>
    <button className="btn ghost" onClick={tutupSheet}>Batal</button>
  </>);
}
