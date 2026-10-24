import bcrypt from 'bcryptjs';
import { exec, q1 } from '@/lib/db';
import { gagal, s } from '@/lib/http';
import { sesi } from '@/lib/sesi';
import { logAksi, me, need } from '@/lib/aturan';
import { settingsPublik } from '@/lib/pengaturan';
import { userPublik } from '@/lib/format';
import type { KumpulanAksi } from '../daftar';

export const aksiAuth: KumpulanAksi = {
  async login(m) {
    const nik = s(m, 'nik').toLowerCase(), pin = s(m, 'pin');
    if (!nik || !pin) gagal('NIK dan PIN wajib diisi');
    const u = await q1('SELECT * FROM users WHERE LOWER(nik)=?', [nik]);
    if (!u) gagal('NIK tidak ditemukan');
    if (u.aktif !== 1) gagal('Akun nonaktif, hubungi HC');
    if (!(await bcrypt.compare(pin, u.pin_hash))) { await logAksi(u.id, 'login_gagal'); gagal('PIN salah'); }
    const ss = await sesi();
    ss.uid = u.id;
    await ss.save();
    await logAksi(u.id, 'login');
    return { me: await userPublik(u), settings: await settingsPublik() };
  },

  async logout() {
    const u = await me();
    if (u) await logAksi(u.id, 'logout');
    (await sesi()).destroy();
    return { ok: true };
  },

  async bootstrap() {
    const u = await me();
    return { me: u ? await userPublik(u) : null, settings: await settingsPublik() };
  },

  async ganti_pin(m) {
    const u = await need();
    if (!(await bcrypt.compare(s(m, 'lama'), u.pin_hash))) gagal('PIN lama salah');
    const baru = s(m, 'baru');
    if (!/^\d{6}$/.test(baru)) gagal('PIN baru harus 6 digit angka');
    await exec('UPDATE users SET pin_hash=? WHERE id=?', [await bcrypt.hash(baru, 10), u.id]);
    await logAksi(u.id, 'ganti_pin');
    return { pesan: 'PIN berhasil diganti' };
  },
};
