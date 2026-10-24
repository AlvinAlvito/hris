# Posi HRIS (Next.js)

Aplikasi HRIS Pusat Olimpiade Sains Indonesia: absensi foto + lokasi, pengajuan (cuti, izin/sakit, setengah hari, WFH, dinas luar kota, lembur, reimburse, kasbon), persetujuan satu pintu di HC, shift & jadwal, data karyawan, laporan, payroll + PPh 21 + BPJS, dan dashboard.

Teknologi: Next.js 15 (App Router) · React 19 · TypeScript · MySQL 8 / MariaDB 10.6+ · iron-session · sharp · ECharts.

## Peran akun

| Peran di aplikasi | Nilai `role` di database | Hak |
|---|---|---|
| Pegawai | `karyawan` | absen, pengajuan, jadwal, slip gaji, profil |
| HC | `admin` | kendali penuh: persetujuan, karyawan, absensi, shift, payroll, pengaturan |
| Super Admin | `direktur` | kendali penuh seperti HC (tidak absen, tidak punya jatah cuti) |

Tidak ada yang bisa menyetujui pengajuannya sendiri; pengajuan milik HC diputus HC lain atau Super Admin.

## Menjalankan di komputer lokal

Butuh Node.js 20 LTS atau lebih baru dan MySQL.

```bash
npm install
cp .env.example .env.local      # isi DB_*, SESSION_SECRET (≥ 32 karakter acak)
npm run migrate                 # buat / perbarui tabel dari db/schema.sql
npm run seed -- 111111 222222 "Pusat Olimpiade Sains Indonesia"   # akun awal: superadmin & hc
npm run dev                     # http://localhost:3000
```

`npm run seed` hanya membuat akun bila tabel `users` masih kosong. Aplikasi memakai skema database yang sama dengan versi PHP, jadi database lama bisa langsung dipakai (cukup jalankan `npm run migrate`).

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | server pengembangan (port 3000) |
| `npm run build` lalu `npm start` | build & jalankan versi produksi |
| `npm run migrate` | tambah tabel/kolom baru; aman diulang, tidak pernah menghapus data |
| `npm run seed -- <pin_superadmin> <pin_hc> "<nama organisasi>"` | akun awal |
| `npm run cleanup` | hapus foto absensi lebih tua dari `RETENSI_BULAN` (baris absensi tetap) |
| `npm test` | uji unit PPh 21 / BPJS / lembur |
| `npm run typecheck` | pemeriksaan tipe TypeScript |

## Pemasangan di server (Ubuntu/Debian)

1. Pasang Node.js 20 LTS, MySQL/MariaDB, dan Nginx. Buat database & pengguna:
   ```sql
   CREATE DATABASE posi_hris CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'posi_user'@'localhost' IDENTIFIED BY 'password-kuat';
   GRANT ALL ON posi_hris.* TO 'posi_user'@'localhost';
   ```
2. Salin folder aplikasi ke mis. `/var/www/posi-hris`, isi `.env.local`, lalu:
   ```bash
   npm ci && npm run migrate && npm run seed -- <pin_superadmin> <pin_hc> "<nama organisasi>" && npm run build
   ```
3. Jalankan sebagai layanan, contoh dengan pm2:
   ```bash
   npm i -g pm2 && pm2 start npm --name posi-hris -- start && pm2 save && pm2 startup
   ```
4. Nginx sebagai reverse proxy + HTTPS (kamera & lokasi browser hanya jalan di HTTPS):
   ```nginx
   server {
     server_name hris.domainanda.org;
     client_max_body_size 30m;            # unggah foto/dokumen/nota
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
   lalu `sudo certbot --nginx -d hris.domainanda.org`.
5. Pembersihan foto harian (cron):
   ```
   15 2 * * * cd /var/www/posi-hris && npm run cleanup >> /var/log/posi-hris-cleanup.log 2>&1
   ```
6. Cadangan: database (`mysqldump`) **dan** folder `storage/` (foto absensi, dokumen privat, logo).

### Memperbarui aplikasi

```bash
git pull   # atau salin berkas baru
npm ci && npm run migrate && npm run build && pm2 restart posi-hris
```

## Struktur folder

```
db/schema.sql            skema database (sumber npm run migrate)
scripts/                 migrate, seed, cleanup
src/app/(app)/           halaman setelah login (beranda, pengajuan, payroll, …)
src/app/api/[aksi]/      satu pintu API: POST /api/<nama_aksi>
src/server/aksi/         penangan aksi per modul (absen, pengajuan, persetujuan, payroll, …)
src/lib/                 database, sesi, aturan bisnis, PPh 21, berkas
src/components/          komponen antarmuka bersama
storage/                 uploads (foto absensi & avatar), private (dokumen & nota), brand (logo)
tests/                   uji unit
```

File di `storage/` tidak berada di folder publik: foto absensi hanya bisa dibuka pengguna yang login, dokumen & nota hanya oleh pemiliknya dan HC.
