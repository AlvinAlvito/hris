'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAplikasi } from '@/components/Aplikasi';
import { Avatar } from '@/components/Avatar';
import { Ikon } from '@/components/Ikon';
import { KameraAbsen } from '@/components/KameraAbsen';
import { FormCuti, FormIzin } from '@/components/FormPengajuan';
import { ItemPengumuman, useBukaPengumuman } from '@/components/Pengumuman';
import { api } from '@/lib/klien/api';
import { jamKerjaTeks, masaKerjaTeks, NAMA_BULAN, pad, salam, tglIndo, tglPendek, todayStr } from '@/lib/klien/format';

type Data = Record<string, any>;
const JENIS_LIBUR: Record<string, [string, string]> = { nasional: ['Libur nasional', 'b-red'], cuti_bersama: ['Cuti bersama', 'b-amber'], perusahaan: ['Libur organisasi', 'b-purple'] };

export default function Beranda() {
  const { me, settings, setMe, bukaSheet, galat } = useAplikasi();
  const [d, setD] = useState<Data | null>(null);
  const [info, setInfo] = useState<Data | null>(null);
  const [jam, setJam] = useState(new Date());

  const muat = useCallback(() => {
    api<Data>('home').then((x) => { setD(x); setMe(x.me); }).catch(galat);
    api<Data>('info_beranda', {}, true).then(setInfo).catch(() => {});
  }, [setMe, galat]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { const t = setInterval(() => setJam(new Date()), 1000); return () => clearInterval(t); }, []);

  const a = d?.hariIni, j = d?.jadwal, iz = d?.izinHariIni ?? { kerjaDari: '', sesi: '' };
  const absen = (mode: 'in' | 'out') => bukaSheet(<KameraAbsen mode={mode} izin={iz} selesai={muat} />);

  let chip = '';
  if (j) {
    if (j.libur) chip = j.sumber === 'nasional' ? 'Libur resmi' + (j.ket ? ' · ' + j.ket : '') : 'Libur';
    else if (j.shift) chip = `${j.shift.nama} · ${j.shift.jamMasuk}–${j.shift.jamPulang}`;
    else if (j.jamMode === 'fleksibel') chip = 'Fleksibel · target ' + jamKerjaTeks(j.target);
    else chip = `Jam kerja ${settings.jamMasuk}–${settings.jamPulang}`;
  }
  const badge: [string, string][] = [];
  if (a) {
    if (a.jamMode === 'fleksibel') badge.push(['Fleksibel', 'b-green']);
    else if (a.terlambat) badge.push([`Terlambat ${a.menitTelat} menit`, 'b-red']);
    else badge.push(['Tepat waktu', 'b-green']);
    if (a.kerjaDari) badge.push([a.kerjaDari === 'wfh' ? 'WFH' : 'Dinas luar kota', 'b-blue']);
    if (a.shiftNama && a.jamMode === 'shift') badge.push([a.shiftNama, 'b-blue']);
    if (a.kurangMenit > 0 && a.outTime) badge.push(['Kurang ' + jamKerjaTeks(a.kurangMenit), 'b-amber']);
    if (a.lemburMenit > 0) badge.push(['Lembur ' + jamKerjaTeks(a.lemburMenit), 'b-purple']);
    if (a.inLuar) badge.push(['Di luar area kantor', 'b-amber']);
    if (!a.outTime) badge.push(['Belum absen pulang', 'b-gray']);
  }

  return (
    <>
      <section className="hero">
        <div className="hero-top">
          <div style={{ minWidth: 0 }}>
            <div className="sapa" suppressHydrationWarning>{salam(jam)}</div>
            <h2>{me?.nama.split(' ')[0]}</h2>
            <div className="date" suppressHydrationWarning>{tglIndo(todayStr(jam))}</div>
          </div>
          <div className="jam-besar" suppressHydrationWarning>
            <div className="clock">{pad(jam.getHours())}:{pad(jam.getMinutes())}</div>
            <div className="dtk">{pad(jam.getSeconds())} detik · WIB</div>
          </div>
        </div>
        <div id="jadwalChip">
          {chip && <span className="chip-jadwal"><Ikon n={j?.libur ? 'coffee' : 'clock'} />{chip}</span>}
          {iz.kerjaDari && <span className="chip-jadwal"><Ikon n={iz.kerjaDari === 'wfh' ? 'house' : 'map-pin'} />{iz.kerjaDari === 'wfh' ? 'WFH hari ini' : 'Dinas luar kota'}</span>}
          {iz.sesi && <span className="chip-jadwal"><Ikon n="timer" />Izin ½ hari {iz.sesi}</span>}
        </div>
        <div className="chips">
          <div className="hchip"><div className="k">Masuk</div><div className="v">{a?.inTime || '--:--'}</div></div>
          <div className="hchip"><div className="k">Pulang</div><div className="v">{a?.outTime || '--:--'}</div></div>
          <div className="hchip"><div className="k">Durasi</div><div className="v">{a?.durasi || (a?.inTime ? '…' : '—')}</div></div>
        </div>
        <div id="stInfo">
          {d?.lupaOut?.length > 0 && (
            <div className="warn"><b>Ada {d!.lupaOut.length} absensi yang belum di-clock out</b><br />
              {d!.lupaOut.map((x: Data) => `${tglPendek(x.tanggal)} (masuk ${x.inTime})`).join(', ')}
              <br /><span className="tiny">Hubungi HC untuk koreksi.</span></div>
          )}
          {d?.ketHariIni && !iz.kerjaDari && !iz.sesi && (
            <div className="note">Hari ini Anda mengajukan <b>{d.ketHariIni.jenisLabel}</b> ({d.ketHariIni.status === 'Disetujui' ? 'disetujui' : 'menunggu HC'})</div>
          )}
          {d && !a && (j?.libur ? <div className="note">Hari ini Anda <b>{j.liburMingguan ? 'libur mingguan' : 'dijadwalkan libur'}</b>. Tidak wajib absen.</div>
            : <div>Belum absen · masuk pukul <b>{settings.jamMasuk}</b>, toleransi {settings.toleransi} menit</div>)}
          {a && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{badge.map(([t, c]) => <span key={t} className={'badge ' + c}>{t}</span>)}</div>}
        </div>
        <div className="hero-act">
          <button className="btn" disabled={!d || !!a?.inTime} onClick={() => absen('in')}><Ikon n="log-in" />Absen Masuk</button>
          <button className="btn out" disabled={!d || !a?.inTime || !!a?.outTime} onClick={() => absen('out')}><Ikon n="log-out" />Absen Pulang</button>
        </div>
      </section>

      <div className="judul-seksi">Layanan</div>
      <div className="quick">
        {([['plane', 'Cuti', () => bukaSheet(<FormCuti selesai={muat} />)],
          ['file-heart', 'Izin / Sakit', () => bukaSheet(<FormIzin jenis="izin" selesai={muat} />)],
          ['timer', '½ Hari', () => bukaSheet(<FormIzin jenis="setengah_hari" selesai={muat} />)],
          ['house', 'WFH', () => bukaSheet(<FormIzin jenis="wfh" selesai={muat} />)],
          ['map-pin', 'Dinas', () => bukaSheet(<FormIzin jenis="dlk" selesai={muat} />)]] as [string, string, () => void][]).map(([ic, t, fn]) => (
          <button key={t} className="qa" onClick={fn}><span className="i"><Ikon n={ic} /></span>{t}</button>
        ))}
        <Link href="/pengajuan" className="qa" style={{ textDecoration: 'none' }}><span className="i"><Ikon n="send" /></span>Semua</Link>
      </div>

      <div className="grid-2">
        <div>
          <div className="card">
            <h3><Ikon n="trending-up" />Bulan Ini <span className="m">· {NAMA_BULAN[jam.getMonth()]} {jam.getFullYear()}</span></h3>
            <div className="statgrid g3">
              {([['circle-check', 'Hadir', d?.hadir ?? 0], ['clock-alert', 'Terlambat', d?.telat ?? 0],
                ['plane', 'Sisa Cuti', me?.cutiAktif ? me.sisa : '—'], ['medal', 'Masa Kerja', masaKerjaTeks(me?.masaKerjaBulan ?? 0)],
                ['hourglass', 'Kurang Jam', jamKerjaTeks(d?.kurangBulan ?? 0)], ['timer', 'Lembur', jamKerjaTeks(d?.lemburBulan ?? 0)]] as [string, string, any][]).map(([ic, k, v]) => (
                <div key={k} className="stat"><span className="si"><Ikon n={ic} /></span><div className="k">{k}</div>
                  <div className="v" style={k === 'Masa Kerja' ? { fontSize: 16 } : undefined}>{v}</div></div>
              ))}
            </div>
          </div>
          {j && <KartuJadwal j={j} a={a} />}
          {me?.lokasiMode === 'kantor' && (
            <div className="card"><h3><Ikon n="map-pin" />Lokasi Absen</h3>
              {me.cabangNama ? (
                <div className={me.cabangLat != null || settings.officeLat != null ? 'note' : 'err'}><b>{me.cabangNama}</b>{' '}
                  <span className={'badge ' + (me.cabangTipe === 'pusat' ? 'b-purple' : 'b-blue')}>{me.cabangTipe === 'pusat' ? 'Kantor Pusat' : 'Cabang'}</span><br />
                  {me.cabangLat != null || settings.officeLat != null ? `Radius ${me.cabangRadius || settings.radius} m` : 'Titik lokasi belum ditetapkan HC.'}</div>
              ) : <div className="err">Lokasi kerja Anda belum ditetapkan HC.</div>}
            </div>
          )}
          {(a?.inPhoto || a?.outPhoto) && (
            <div className="card"><h3><Ikon n="camera" />Foto Absen Hari Ini</h3>
              <div className="row">
                <div><div className="tiny muted center" style={{ marginBottom: 4 }}>Masuk</div>{a.inPhoto && <img className="thumb" src={a.inPhoto} alt="foto masuk" />}</div>
                <div><div className="tiny muted center" style={{ marginBottom: 4 }}>Pulang</div>{a.outPhoto && <img className="thumb" src={a.outPhoto} alt="foto pulang" />}</div>
              </div>
            </div>
          )}
        </div>
        <div>
          <Pengumuman info={info} setInfo={setInfo} />
          <div className="card"><h3><Ikon n="cake" />Ulang Tahun & Masa Kerja</h3>
            {!info ? <div className="skel" style={{ height: 60 }} /> : info.perayaan.length ? (
              <div className="rayakan">{info.perayaan.map((p: Data) => (
                <div key={p.jenis + p.id} className="p"><Avatar u={p} ukuran={46} />
                  <div className="nm">{p.nama.split(' ').slice(0, 2).join(' ')}</div>
                  <div className="ket">{p.jenis === 'ultah' ? 'Ulang tahun' : p.ke + ' tahun berkarya'}</div>
                  <div className={'badge ' + (p.dalamHari === 0 ? 'b-green' : 'b-gray')} style={{ marginTop: 4 }}>
                    {p.dalamHari === 0 ? 'Hari ini!' : p.dalamHari === 1 ? 'Besok' : tglPendek(p.tanggal).replace(/ \d{4}$/, '')}</div>
                </div>))}</div>
            ) : <div className="empty"><Ikon n="cake" />Tidak ada dalam dua minggu ke depan.</div>}
          </div>
          <div className="card"><h3><Ikon n="calendar-days" />Libur Terdekat</h3>
            {!info ? <div className="skel" style={{ height: 60 }} /> : info.liburMendatang.length ? info.liburMendatang.map((l: Data) => {
              const sisa = Math.round((new Date(l.tanggal + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 864e5);
              return (
                <div key={l.tanggal} className="kv" style={{ padding: '7px 0', borderBottom: '1px dashed var(--line)' }}>
                  <span><b style={{ color: 'var(--ink)' }}>{tglPendek(l.tanggal)}</b> · {l.nama}</span>
                  <span className={'badge ' + JENIS_LIBUR[l.jenis]?.[1]}>{sisa === 0 ? 'hari ini' : sisa + ' hari lagi'}</span>
                </div>);
            }) : <div className="empty">Belum ada.</div>}
          </div>
        </div>
      </div>
    </>
  );
}

function KartuJadwal({ j, a }: { j: Data; a: Data | null }) {
  const { settings } = useAplikasi();
  let isi;
  if (j.jamMode === 'shift') {
    isi = j.libur ? <div className="note"><b>Hari ini libur.</b></div>
      : j.shift ? (<><div className="note"><b>{j.shift.nama}</b> · {j.shift.jamMasuk} – {j.shift.jamPulang}{j.shift.lintasHari && <> <span className="badge b-purple">lintas hari</span></>}
        <br />Durasi {jamKerjaTeks(j.target)} · toleransi terlambat {j.shift.toleransi} menit</div>
        {j.shift.lintasHari && <div className="tiny muted" style={{ marginTop: 6 }}>Berakhir keesokan hari.</div>}</>)
        : <div className="err">Belum ada shift hari ini. Hubungi HC.</div>;
  } else if (j.jamMode === 'fleksibel') {
    const sudah = a?.menitKerja || 0, persen = Math.min(100, Math.round((sudah / j.target) * 100));
    isi = (<>
      <div className="note"><b>Jam kerja fleksibel</b><br />Target hari ini <b>{jamKerjaTeks(j.target)}</b>{j.intiMulai && ` · jam inti ${j.intiMulai}–${j.intiSelesai}`}</div>
      {a?.inTime && (<div style={{ marginTop: 10 }}>
        <div className="kv"><span>Sudah bekerja</span><span><b>{a.outTime ? jamKerjaTeks(sudah) : 'berjalan sejak ' + a.inTime}</b></span></div>
        {a.outTime && <><div className="bar" style={{ marginTop: 6 }}><i style={{ width: persen + '%' }} /></div>
          <div className="tiny muted" style={{ marginTop: 4 }}>{a.kurangMenit > 0 ? 'Kurang ' + jamKerjaTeks(a.kurangMenit) + ' dari target' : a.lemburMenit > 0 ? 'Lembur ' + jamKerjaTeks(a.lemburMenit) : 'Target hari ini terpenuhi'}</div></>}
      </div>)}
    </>);
  } else isi = <div className="note">Jam kerja tetap <b>{settings.jamMasuk} – {settings.jamPulang}</b> · toleransi {settings.toleransi} menit</div>;
  return <div className="card"><h3><Ikon n="clock" />Jadwal Hari Ini</h3>{isi}</div>;
}

function Pengumuman({ info, setInfo }: { info: Data | null; setInfo: (f: (x: Data | null) => Data | null) => void }) {
  const buka = useBukaPengumuman(setInfo);
  return (
    <div className="card"><h3><Ikon n="megaphone" />Pengumuman {info?.belumDibaca > 0 && <span className="badge b-red">{info!.belumDibaca} baru</span>}</h3>
      {!info ? <div className="skel" style={{ height: 60 }} /> : info.pengumuman.length ? (<>
        {info.pengumuman.slice(0, 4).map((p: Data) => <ItemPengumuman key={p.id} p={p} buka={() => buka(p)} />)}
        {info.pengumuman.length > 4 && <Link href="/informasi" className="btn ghost sm" style={{ marginTop: 10 }}>Lihat semua</Link>}
      </>) : <div className="empty"><Ikon n="megaphone" />Belum ada pengumuman.</div>}
    </div>
  );
}
