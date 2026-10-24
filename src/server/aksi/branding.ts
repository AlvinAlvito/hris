/* Identitas organisasi: nama, slogan, logo, favicon, manifest PWA, tampilan per pengguna */
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { exec } from '@/lib/db';
import { gagal, s } from '@/lib/http';
import { logAksi, need } from '@/lib/aturan';
import { setg, setSetting, settingsPublik } from '@/lib/pengaturan';
import { dataUrlKeBuffer, folderPenyimpanan } from '@/lib/berkas';
import type { KumpulanAksi } from '../daftar';

const TEMA_TERSEDIA = ['posi', 'nebula', 'samudra', 'zamrud', 'senja', 'grafit', 'brand'];

/* gambar dikodekan ulang ke PNG (transparansi dipertahankan); favicon dibuat persegi */
async function simpanGambarBrand(dataUrl: string, awalan: string, maks: number, persegi: boolean): Promise<string> {
  const { buf } = dataUrlKeBuffer(dataUrl, /^image\/(png|jpe?g|webp)$/);
  if (buf.length > 2 * 1024 * 1024) gagal('Gambar rusak atau lebih dari 2 MB');
  let hasil: Buffer;
  try {
    const g = sharp(buf).rotate();
    hasil = persegi
      ? await g.resize(maks, maks, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
      : await g.resize(maks, maks, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch { gagal('Berkas bukan gambar yang sah'); }
  const dir = folderPenyimpanan('brand');
  await mkdir(dir, { recursive: true });
  const nama = `${awalan}-${randomBytes(6).toString('hex')}.png`;
  await writeFile(path.join(dir, nama), hasil);
  return nama;
}
async function hapusBerkasBrand(kunci: string) {
  const lama = await setg(kunci, '');
  if (lama && /^[\w.-]+$/.test(lama)) await unlink(path.join(folderPenyimpanan('brand'), lama)).catch(() => {});
}
/* nama pendek ikon HP: buang kata umum di depan (Yayasan, PT, …) */
function namaPendek(n: string): string {
  const umum = ['yayasan', 'pt', 'pt.', 'cv', 'cv.', 'pendidikan', 'perkumpulan', 'lembaga', 'koperasi', 'tbk', 'tbk.', 'pusat'];
  const kata = n.trim().split(/\s+/).filter((k) => k && !umum.includes(k.toLowerCase()));
  const inti = kata[0] ?? n.trim();
  return (inti + ' HRIS').length <= 12 ? inti + ' HRIS' : inti.slice(0, 12);
}

export const aksiBranding: KumpulanAksi = {
  async br_info() {
    const st = await settingsPublik();
    return { perusahaan: st.perusahaan, slogan: st.slogan, logo: st.logo, favicon: st.favicon, temaDefault: st.temaDefault, warnaBrand: st.warnaBrand };
  },
  async br_manifest() {
    const st = await settingsPublik();
    const manifest = {
      name: 'HRIS · ' + st.perusahaan, short_name: namaPendek(st.perusahaan), start_url: '/', display: 'standalone',
      background_color: '#0e2a55', theme_color: '#0e2a55',
      icons: [{ src: st.logo || st.favicon || '/ikon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: st.logo || st.favicon || '/ikon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
    };
    return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' } });
  },
  async br_simpan(m) {
    const u = await need(['admin']);
    const nama = s(m, 'perusahaan');
    if (!nama) gagal('Nama organisasi wajib diisi');
    const tema = s(m, 'temaDefault', 'posi');
    if (!TEMA_TERSEDIA.includes(tema)) gagal('Tema tidak dikenal');
    const warna = s(m, 'warnaBrand');
    if (warna !== '' && !/^#[0-9a-f]{6}$/i.test(warna)) gagal('Warna brand harus kode heks, mis. #1b4f94');
    await setSetting('perusahaan', nama.slice(0, 120));
    await setSetting('slogan', s(m, 'slogan').slice(0, 160));
    await setSetting('tema_default', tema);
    await setSetting('warna_brand', warna.toLowerCase());
    await logAksi(u.id, 'ubah_identitas', nama);
    return { pesan: 'Identitas tersimpan', settings: await settingsPublik() };
  },
  async br_logo(m) { return gantiGambar(m, true); },
  async br_favicon(m) { return gantiGambar(m, false); },
  async br_hapus(m) {
    const u = await need(['admin']);
    const jenis = s(m, 'jenis');
    if (jenis !== 'logo' && jenis !== 'favicon') gagal('Jenis tidak dikenal');
    await hapusBerkasBrand(jenis + '_file');
    await setSetting(jenis + '_file', '');
    await logAksi(u.id, 'hapus_' + jenis);
    return { pesan: (jenis === 'logo' ? 'Logo' : 'Favicon') + ' dihapus, kembali ke bawaan', settings: await settingsPublik() };
  },
  async br_tema_saya(m) {
    const u = await need();
    const tema = s(m, 'tema'), mode = s(m, 'mode', 'auto');
    if (tema !== '' && !TEMA_TERSEDIA.includes(tema)) gagal('Tema tidak dikenal');
    if (!['auto', 'terang', 'gelap'].includes(mode)) gagal('Mode tampilan tidak dikenal');
    await exec('UPDATE users SET tema=?, mode_tampilan=? WHERE id=?', [tema, mode, u.id]);
    return { pesan: 'Tampilan disimpan', tema, mode };
  },
};

async function gantiGambar(m: Record<string, any>, logo: boolean) {
  const u = await need(['admin']);
  const kunci = logo ? 'logo_file' : 'favicon_file';
  const nama = await simpanGambarBrand(s(m, 'gambar'), logo ? 'logo' : 'favicon', logo ? 512 : 128, !logo);
  await hapusBerkasBrand(kunci);
  await setSetting(kunci, nama);
  await logAksi(u.id, logo ? 'ganti_logo' : 'ganti_favicon', nama);
  return { pesan: logo ? 'Logo diperbarui' : 'Favicon diperbarui', settings: await settingsPublik() };
}
