/* Notifikasi: disimpan di tabel notifikasi (lonceng di aplikasi) lalu dikirim sebagai Web Push ke perangkat
   yang berlangganan. Kegagalan push tidak pernah menggagalkan aksi utama.
   Pengaman: server produksi hanya mengirim ke langganan dari situs produksi, server pengembangan (localhost)
   hanya ke langganan localhost — salinan database produksi di laptop tidak akan mengirim ke HP karyawan. */
import webpush from 'web-push';
import { exec, q } from './db';
import { jalankanDalamKonteks } from './konteks';
import { setg, setSetting } from './pengaturan';

export interface IsiNotif { judul: string; isi?: string; tautan?: string; jenis?: string; kunci?: string }

const LOKAL = "(asal LIKE 'http://localhost%' OR asal LIKE 'http://127.0.0.1%')";
const filterAsal = () => (process.env.NODE_ENV === 'production' ? ` AND NOT ${LOKAL}` : ` AND ${LOKAL}`);

/* kunci VAPID dibuat sekali lalu disimpan di pengaturan */
export async function kunciVapid(): Promise<{ publik: string; privat: string }> {
  let publik = await setg('vapid_publik', ''), privat = await setg('vapid_privat', '');
  if (!publik || !privat) {
    const k = webpush.generateVAPIDKeys();
    await setSetting('vapid_publik', k.publicKey);
    await setSetting('vapid_privat', k.privateKey);
    publik = k.publicKey; privat = k.privateKey;
  }
  return { publik, privat };
}

/* simpan ke lonceng & kirim push. Kunci yang sama tidak dikirim dua kali (mis. pengingat harian). */
export async function kirimNotif(userIds: number[], n: IsiNotif): Promise<number> {
  const ids = [...new Set(userIds.filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) return 0;
  const baru: number[] = [];
  for (const uid of ids) {
    const kunci = n.kunci ? `${n.kunci}:${uid}`.slice(0, 100) : null;
    const r = await exec(`INSERT IGNORE INTO notifikasi (user_id,jenis,judul,isi,tautan,kunci) VALUES (?,?,?,?,?,?)`,
      [uid, (n.jenis ?? 'info').slice(0, 30), n.judul.slice(0, 150), (n.isi ?? '').slice(0, 500), (n.tautan ?? '').slice(0, 200), kunci]);
    if (r.affectedRows) baru.push(uid);
  }
  if (baru.length) {
    try {
      const lang = await q(`SELECT id, endpoint, p256dh, auth FROM push_langganan WHERE user_id IN (${baru.join(',')})${filterAsal()}`);
      if (lang.length) void kirimPush(lang, n);   // jaringan di latar belakang; respons API tidak menunggu
    } catch (e) { console.error('[notifikasi] gagal membaca langganan push', e); }
  }
  return baru.length;
}

async function kirimPush(lang: Record<string, any>[], n: IsiNotif): Promise<void> {
  // konteks baru tanpa koneksi transaksi: permintaan asal mungkin sudah selesai
  await jalankanDalamKonteks({ ip: '', ua: '' }, async () => {
    try {
      const { publik, privat } = await kunciVapid();
      const subjek = (await setg('vapid_subjek', '')) || 'mailto:noreply@posi.my.id';
      webpush.setVapidDetails(subjek, publik, privat);
      const muatan = JSON.stringify({ judul: n.judul, isi: n.isi ?? '', tautan: n.tautan || '/', jenis: n.jenis ?? 'info', tag: n.kunci ?? undefined });
      await Promise.all(lang.map(async (l) => {
        try {
          await webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, muatan, { TTL: 3600, timeout: 10000, urgency: 'high' });
        } catch (e: any) {
          // langganan kedaluwarsa / dicabut pengguna: hapus
          if (e?.statusCode === 404 || e?.statusCode === 410) await exec('DELETE FROM push_langganan WHERE id=?', [l.id]);
          else console.error('[notifikasi] push gagal', e?.statusCode ?? '', e?.body ?? e?.message ?? e);
        }
      }));
    } catch (e) { console.error('[notifikasi] push gagal', e); }
  });
}

/* siapa yang memutus pengajuan karyawan ini: Supervisor di atasnya (berjenjang) + HC + Super Admin */
export async function penyetujuUntuk(uid: number): Promise<number[]> {
  const semua = await q('SELECT id, atasan_id, role, aktif FROM users');
  const peta = new Map(semua.map((x) => [x.id as number, x]));
  const hasil = new Set<number>();
  for (let a = peta.get(uid)?.atasan_id, n = 0; a && n < 50; a = peta.get(a)?.atasan_id, n++) {
    const x = peta.get(a);
    if (x && x.aktif === 1 && x.role === 'atasan') hasil.add(x.id);
  }
  for (const x of semua) if (x.aktif === 1 && (x.role === 'admin' || x.role === 'direktur')) hasil.add(x.id);
  hasil.delete(uid);
  return [...hasil];
}

/* bungkus aman untuk dipanggil dari aksi: notifikasi tidak boleh menggagalkan aksi utama */
export async function beriTahu(userIds: number[] | Promise<number[]>, n: IsiNotif): Promise<void> {
  try { await kirimNotif(await userIds, n); } catch (e) { console.error('[notifikasi]', e); }
}
