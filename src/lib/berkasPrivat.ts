/* Berkas privat (dokumen karyawan, nota reimburse, lampiran kasbon) — disimpan di luar folder public,
   hanya bisa diunduh lewat API yang memeriksa hak akses. */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { exec, q, type Baris } from './db';
import { gagal } from './http';
import { isAdminUp, isFinance, type User } from './aturan';
import { dataUrlKeBuffer, folderPenyimpanan, jalurAman } from './berkas';
import { tglWIB } from './waktu';

/* gambar dikodekan ulang (membuang metadata & muatan tersembunyi) dan diperkecil bila > 2000 px;
   PDF diperiksa tanda tangannya (%PDF-) */
export async function simpanBerkas(dataUrl: string, pemilik: number, kategori: string, refId: number | null, jenis: string,
  namaAsli: string, pengunggah: number, berlaku: string | null = null): Promise<number> {
  let { buf } = dataUrlKeBuffer(dataUrl, /^[\w.+-]+\/[\w.+-]+$/);
  if (!buf.length) gagal('Berkas rusak atau kosong');
  if (buf.length > 5 * 1024 * 1024) gagal('Ukuran berkas maksimal 5 MB');
  let mime: string, ext: string;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') { mime = 'application/pdf'; ext = 'pdf'; }
  else {
    try {
      const meta = await sharp(buf).metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '')) throw new Error();
      buf = await sharp(buf).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    } catch { gagal('Hanya menerima foto (JPG, PNG, WebP) atau PDF'); }
    mime = 'image/jpeg'; ext = 'jpg';
  }
  const sub = tglWIB().slice(0, 7).replace('-', '/');
  await mkdir(path.join(folderPenyimpanan('private'), sub), { recursive: true });
  const nama = `${sub}/${randomBytes(16).toString('hex')}.${ext}`;
  await writeFile(path.join(folderPenyimpanan('private'), nama), buf);
  const asli = (namaAsli.replace(/[^\p{L}\p{N} ._()-]/gu, '_') || 'berkas.' + ext).slice(0, 200);
  const r = await exec(`INSERT INTO berkas (user_id,kategori,ref_id,jenis,nama_asli,path,mime,ukuran,berlaku_sampai,diunggah_oleh)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [pemilik, kategori, refId, jenis.slice(0, 60), asli, nama, mime, buf.length, berlaku, pengunggah]);
  return r.insertId;
}
export function berkasRow(b: Baris) {
  return {
    id: b.id, userId: b.user_id, kategori: b.kategori, refId: b.ref_id, jenis: b.jenis, nama: b.nama_asli, mime: b.mime,
    ukuran: b.ukuran, berlakuSampai: b.berlaku_sampai, tanggal: b.created_at, url: '/api/dok_unduh?id=' + b.id,
  };
}
export async function berkasUntuk(kategori: string, refId: number) {
  return (await q('SELECT * FROM berkas WHERE kategori=? AND ref_id=? ORDER BY id', [kategori, refId])).map(berkasRow);
}
/* hak lihat berkas: pemilik dan HC / Super Admin */
export function bolehLihatBerkas(u: User, b: Baris): boolean {
  if (b.user_id === u.id || isAdminUp(u)) return true;
  return isFinance(u) && ['reimburse', 'kasbon'].includes(b.kategori);
}
export async function hapusBerkasFisik(b: Baris) {
  const p = jalurAman(folderPenyimpanan('private'), b.path);
  if (p) await unlink(p).catch(() => {});
}
export async function bacaBerkas(b: Baris): Promise<Buffer | null> {
  const p = jalurAman(folderPenyimpanan('private'), b.path);
  if (!p) return null;
  try { return await readFile(p); } catch { return null; }
}
