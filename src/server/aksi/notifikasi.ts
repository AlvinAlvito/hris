/* Lonceng notifikasi & langganan Web Push milik pengguna yang sedang masuk */
import { exec, nilai, q } from '@/lib/db';
import { gagal, i, s } from '@/lib/http';
import { need } from '@/lib/aturan';
import { kirimNotif, kunciVapid } from '@/lib/notifikasi';
import { konteks } from '@/lib/konteks';
import type { KumpulanAksi } from '../daftar';

export const aksiNotifikasi: KumpulanAksi = {
  async notif_daftar(m) {
    const u = await need();
    const sejak = i(m, 'sejak');   // id terakhir yang sudah diketahui browser; 0 = ambil daftar penuh
    const items = await q(`SELECT id, jenis, judul, isi, tautan, dibaca, created_at FROM notifikasi WHERE user_id=?${sejak ? ' AND id>?' : ''}
      ORDER BY id DESC LIMIT 40`, sejak ? [u.id, sejak] : [u.id]);
    const belum = Number(await nilai('SELECT COUNT(*) FROM notifikasi WHERE user_id=? AND dibaca=0', [u.id]));
    return { belum, items: items.map((x) => ({ id: x.id, jenis: x.jenis, judul: x.judul, isi: x.isi, tautan: x.tautan, dibaca: x.dibaca === 1, waktu: x.created_at })) };
  },
  async notif_baca(m) {
    const u = await need();
    const id = i(m, 'id');
    if (id) await exec('UPDATE notifikasi SET dibaca=1 WHERE id=? AND user_id=?', [id, u.id]);
    else await exec('UPDATE notifikasi SET dibaca=1 WHERE user_id=? AND dibaca=0', [u.id]);
    return { ok: true };
  },
  async notif_hapus_semua() {
    const u = await need();
    await exec('DELETE FROM notifikasi WHERE user_id=? AND dibaca=1', [u.id]);
    return { pesan: 'Notifikasi yang sudah dibaca dihapus' };
  },

  async push_kunci() {
    await need();
    return { kunci: (await kunciVapid()).publik };
  },
  async push_langganan(m) {
    const u = await need();
    const sub = m.langganan as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    const endpoint = String(sub?.endpoint ?? ''), p256dh = String(sub?.keys?.p256dh ?? ''), auth = String(sub?.keys?.auth ?? '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 700 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) gagal('Data langganan notifikasi tidak sah');
    const asal = s(m, 'asal').slice(0, 150);
    await exec(`INSERT INTO push_langganan (user_id,endpoint,p256dh,auth,asal,ua) VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), p256dh=VALUES(p256dh), auth=VALUES(auth), asal=VALUES(asal), ua=VALUES(ua)`,
    [u.id, endpoint, p256dh, auth, asal, (konteks()?.ua ?? '').slice(0, 255)]);
    return { pesan: 'Notifikasi aktif di perangkat ini' };
  },
  async push_lepas(m) {
    const u = await need();
    await exec('DELETE FROM push_langganan WHERE endpoint=? AND user_id=?', [s(m, 'endpoint'), u.id]);
    return { pesan: 'Notifikasi dimatikan di perangkat ini' };
  },
  async push_status(m) {
    const u = await need();
    const ada = Number(await nilai('SELECT COUNT(*) FROM push_langganan WHERE endpoint=? AND user_id=?', [s(m, 'endpoint'), u.id]));
    return { terdaftar: ada > 0 };
  },
  async notif_uji() {
    const u = await need();
    await kirimNotif([u.id], { judul: 'Notifikasi berfungsi 🎉', isi: 'Anda akan menerima pengingat absen dan kabar persetujuan di perangkat ini.', tautan: '/profil', jenis: 'uji' });
    return { pesan: 'Notifikasi uji dikirim' };
  },
};
