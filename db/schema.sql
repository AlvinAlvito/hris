-- =====================================================================
-- Skema database Posi HRIS — Yayasan Pendidikan Posi
-- Aman dijalankan berulang (CREATE TABLE IF NOT EXISTS / INSERT IGNORE).
-- Kolom baru pada tabel lama ditambahkan otomatis oleh scripts/migrate.mjs (npm run migrate).
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS cabang (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  nama       VARCHAR(120) NOT NULL,
  tipe       ENUM('pusat','cabang','kegiatan') NOT NULL DEFAULT 'cabang',  -- pusat / perwakilan / lokasi kegiatan
  alamat     VARCHAR(255) NOT NULL DEFAULT '',
  lat        DECIMAL(10,7) NULL,
  lng        DECIMAL(10,7) NULL,
  radius     INT NOT NULL DEFAULT 200,
  aktif      TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tipe), INDEX (aktif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shift (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nama        VARCHAR(80)  NOT NULL,
  jam_masuk   TIME NOT NULL,
  jam_pulang  TIME NOT NULL,
  toleransi   INT  NOT NULL DEFAULT 10,
  lintas_hari TINYINT(1) NOT NULL DEFAULT 0,   -- pulang di hari berikutnya (shift malam)
  aktif       TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shift_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nik           VARCHAR(50)  NOT NULL UNIQUE,
  nama          VARCHAR(120) NOT NULL,
  jabatan       VARCHAR(120) NOT NULL DEFAULT 'Staff',
  dept          VARCHAR(120) NOT NULL DEFAULT '',
  pin_hash      VARCHAR(255) NOT NULL,
  tgl_masuk     DATE         NOT NULL,
  role          ENUM('karyawan','atasan','finance','admin','direktur') NOT NULL DEFAULT 'karyawan',
  cuti_mode     ENUM('auto','on','off')             NOT NULL DEFAULT 'auto',
  jatah         INT          NOT NULL DEFAULT 12,
  lokasi_mode   ENUM('kantor','lapangan','bebas')   NOT NULL DEFAULT 'kantor',
  min_jarak_km  DECIMAL(5,2) NOT NULL DEFAULT 2.50,
  base_lat      DECIMAL(10,7) NULL,
  base_lng      DECIMAL(10,7) NULL,
  base_label    VARCHAR(150) NOT NULL DEFAULT '',
  base_set_by   VARCHAR(120) NOT NULL DEFAULT '',
  base_set_at   DATETIME     NULL,
  cabang_id     INT          NULL,
  jam_mode      ENUM('tetap','shift','fleksibel') NOT NULL DEFAULT 'tetap',
  shift_id      INT          NULL,              -- shift bawaan bila jam_mode='shift'
  target_menit  INT          NOT NULL DEFAULT 480,
  inti_mulai    TIME         NULL,              -- jam inti (opsional, mode fleksibel)
  inti_selesai  TIME         NULL,
  libur_hari    VARCHAR(20)  NULL,              -- hari libur mingguan (1-7 ISO, koma). NULL=bawaan, '0'=tidak ada
  -- ---- data kepegawaian ----
  atasan_id     INT          NULL,              -- atasan langsung (struktur organisasi)
  status_kerja  ENUM('tetap','kontrak','probation','magang','harian','freelance') NOT NULL DEFAULT 'tetap',
  kontrak_mulai DATE         NULL,
  kontrak_selesai DATE       NULL,
  tgl_keluar    DATE         NULL,
  -- ---- biodata ----
  jk            ENUM('','L','P') NOT NULL DEFAULT '',
  tempat_lahir  VARCHAR(80)  NOT NULL DEFAULT '',
  tgl_lahir     DATE         NULL,
  agama         VARCHAR(30)  NOT NULL DEFAULT '',
  status_nikah  ENUM('','lajang','menikah','cerai') NOT NULL DEFAULT '',
  no_ktp        VARCHAR(30)  NOT NULL DEFAULT '',
  npwp          VARCHAR(30)  NOT NULL DEFAULT '',
  no_hp         VARCHAR(30)  NOT NULL DEFAULT '',
  email         VARCHAR(120) NOT NULL DEFAULT '',
  alamat        VARCHAR(255) NOT NULL DEFAULT '',
  alamat_domisili VARCHAR(255) NOT NULL DEFAULT '',
  pendidikan    VARCHAR(40)  NOT NULL DEFAULT '',
  jurusan       VARCHAR(100) NOT NULL DEFAULT '',
  institusi     VARCHAR(120) NOT NULL DEFAULT '',
  bank_nama     VARCHAR(60)  NOT NULL DEFAULT '',
  bank_rekening VARCHAR(40)  NOT NULL DEFAULT '',
  bank_atas_nama VARCHAR(120) NOT NULL DEFAULT '',
  bpjs_kes_no   VARCHAR(30)  NOT NULL DEFAULT '',
  bpjs_tk_no    VARCHAR(30)  NOT NULL DEFAULT '',
  darurat_nama  VARCHAR(120) NOT NULL DEFAULT '',
  darurat_hubungan VARCHAR(40) NOT NULL DEFAULT '',
  darurat_hp    VARCHAR(30)  NOT NULL DEFAULT '',
  foto_profil   VARCHAR(120) NOT NULL DEFAULT '',
  -- ---- preferensi tampilan ----
  tema          VARCHAR(20)  NOT NULL DEFAULT '',
  mode_tampilan ENUM('auto','terang','gelap') NOT NULL DEFAULT 'auto',
  aktif         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (role), INDEX (aktif), INDEX (cabang_id), INDEX (jam_mode), INDEX (atasan_id), INDEX (kontrak_selesai),
  CONSTRAINT fk_user_cabang FOREIGN KEY (cabang_id) REFERENCES cabang(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_shift FOREIGN KEY (shift_id) REFERENCES shift(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS absensi (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT  NOT NULL,
  tanggal     DATE NOT NULL,
  mode        VARCHAR(20)  NOT NULL DEFAULT 'kantor',
  in_time     TIME NULL,
  in_photo    VARCHAR(200) NOT NULL DEFAULT '',
  in_lat      DECIMAL(10,7) NULL,
  in_lng      DECIMAL(10,7) NULL,
  in_jarak    INT NULL,
  in_luar     TINYINT(1) NOT NULL DEFAULT 0,
  out_time    TIME NULL,
  out_photo   VARCHAR(200) NOT NULL DEFAULT '',
  out_lat     DECIMAL(10,7) NULL,
  out_lng     DECIMAL(10,7) NULL,
  out_jarak   INT NULL,
  out_luar    TINYINT(1) NOT NULL DEFAULT 0,
  base_label  VARCHAR(150) NOT NULL DEFAULT '',
  cabang_id   INT NULL,
  cabang_nama VARCHAR(120) NOT NULL DEFAULT '',
  jam_mode    VARCHAR(12) NOT NULL DEFAULT 'tetap',
  kerja_dari  VARCHAR(10) NOT NULL DEFAULT '',     -- 'wfh' / 'dlk' bila absen dengan izin kerja di luar kantor
  izin_sesi   VARCHAR(10) NOT NULL DEFAULT '',     -- 'pagi' / 'siang' bila izin setengah hari
  shift_id    INT NULL,
  shift_nama  VARCHAR(80) NOT NULL DEFAULT '',
  jadwal_in   TIME NULL,                        -- jam masuk seharusnya (tetap/shift)
  jadwal_out  TIME NULL,
  target_menit INT NOT NULL DEFAULT 0,
  kurang_menit INT NOT NULL DEFAULT 0,
  lembur_menit INT NOT NULL DEFAULT 0,
  tgl_pulang  DATE NULL,                        -- diisi bila clock out lewat tengah malam
  langgar_inti TINYINT(1) NOT NULL DEFAULT 0,
  terlambat   TINYINT(1) NOT NULL DEFAULT 0,
  menit_telat INT NOT NULL DEFAULT 0,
  menit_kerja INT NOT NULL DEFAULT 0,
  lupa_out    TINYINT(1) NOT NULL DEFAULT 0,      -- clock in tanpa clock out, sudah lewat batas wajar
  dikoreksi   TINYINT(1) NOT NULL DEFAULT 0,      -- pernah diperbaiki HR / Direktur
  koreksi_oleh VARCHAR(150) NOT NULL DEFAULT '',
  koreksi_catatan VARCHAR(255) NOT NULL DEFAULT '',
  tgl_koreksi DATETIME NULL,
  ip          VARCHAR(45)  NOT NULL DEFAULT '',
  ua          VARCHAR(255) NOT NULL DEFAULT '',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_tgl (user_id, tanggal),
  INDEX (tanggal), INDEX (cabang_id),
  CONSTRAINT fk_abs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jadwal_shift (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  user_id  INT  NOT NULL,
  tanggal  DATE NOT NULL,
  shift_id INT  NULL,                            -- NULL = dijadwalkan LIBUR
  catatan  VARCHAR(150) NOT NULL DEFAULT '',
  tukar_id INT NULL,
  asal     VARCHAR(20) NOT NULL DEFAULT 'manual',
  dibuat_oleh VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_jadwal (user_id, tanggal),
  INDEX (tanggal),
  CONSTRAINT fk_jadwal_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_jadwal_shift FOREIGN KEY (shift_id) REFERENCES shift(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pengajuan (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  jenis         ENUM('ganti_shift','libur','lembur') NOT NULL,
  tanggal       DATE NOT NULL,
  tanggal2      DATE NULL,               -- libur pengganti (untuk pindah libur)
  shift_id      INT NULL,                -- shift yang diminta (ganti shift)
  jam_mulai     TIME NULL,               -- lembur
  jam_selesai   TIME NULL,
  menit         INT NOT NULL DEFAULT 0,  -- durasi lembur yang diajukan
  alasan        VARCHAR(255) NOT NULL DEFAULT '',
  bukti_link    VARCHAR(1000) NOT NULL DEFAULT '',
  status        ENUM('Menunggu Rekomendasi','Menunggu HR','Disetujui','Ditolak Kepala Toko','Ditolak HR','Dibatalkan')
                NOT NULL DEFAULT 'Menunggu HR',
  rekomendasi   ENUM('','Direkomendasikan','Tidak Direkomendasikan') NOT NULL DEFAULT '',
  perekomendasi VARCHAR(150) NOT NULL DEFAULT '',
  catatan_rekomendasi VARCHAR(255) NOT NULL DEFAULT '',
  approver      VARCHAR(150) NOT NULL DEFAULT '',
  catatan_hr    VARCHAR(255) NOT NULL DEFAULT '',
  jadwal_sebelum VARCHAR(80) NOT NULL DEFAULT '',
  jadwal_sesudah VARCHAR(80) NOT NULL DEFAULT '',
  tgl_rekomendasi DATETIME NULL,
  tgl_putusan     DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (status), INDEX (tanggal), INDEX (jenis),
  CONSTRAINT fk_pengajuan_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pengajuan_shift FOREIGN KEY (shift_id) REFERENCES shift(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tukar_jadwal (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  jenis         ENUM('shift','libur') NOT NULL DEFAULT 'shift',
  pemohon_id    INT  NOT NULL,
  tgl_pemohon   DATE NOT NULL,
  rekan_id      INT  NOT NULL,
  tgl_rekan     DATE NOT NULL,
  alasan        VARCHAR(255) NOT NULL DEFAULT '',
  bukti_link    VARCHAR(1000) NOT NULL DEFAULT '',
  status        ENUM('Menunggu Rekan','Menunggu Rekomendasi','Menunggu HR','Disetujui','Ditolak Rekan','Ditolak Kepala Toko','Ditolak HR','Dibatalkan')
                NOT NULL DEFAULT 'Menunggu Rekan',
  rekomendasi   ENUM('','Direkomendasikan','Tidak Direkomendasikan') NOT NULL DEFAULT '',
  perekomendasi VARCHAR(150) NOT NULL DEFAULT '',
  catatan_rekomendasi VARCHAR(255) NOT NULL DEFAULT '',
  tgl_rekomendasi DATETIME NULL,
  catatan_rekan VARCHAR(255) NOT NULL DEFAULT '',
  catatan_hr    VARCHAR(255) NOT NULL DEFAULT '',
  approver      VARCHAR(150) NOT NULL DEFAULT '',
  -- rekaman kondisi sebelum & sesudah tukar, agar jejaknya tetap terbaca
  shift_pemohon_sebelum VARCHAR(80) NOT NULL DEFAULT '',
  shift_rekan_sebelum   VARCHAR(80) NOT NULL DEFAULT '',
  shift_pemohon_sesudah VARCHAR(80) NOT NULL DEFAULT '',
  shift_rekan_sesudah   VARCHAR(80) NOT NULL DEFAULT '',
  tgl_respon_rekan DATETIME NULL,
  tgl_putusan      DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (pemohon_id), INDEX (rekan_id), INDEX (status), INDEX (tgl_pemohon),
  CONSTRAINT fk_tukar_pemohon FOREIGN KEY (pemohon_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tukar_rekan   FOREIGN KEY (rekan_id)   REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuti (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  jenis       VARCHAR(40) NOT NULL,
  mulai       DATE NOT NULL,
  selesai     DATE NOT NULL,
  hari        INT  NOT NULL,
  alasan      TEXT NOT NULL,
  bukti_link  VARCHAR(1000) NOT NULL DEFAULT '',
  status      ENUM('Menunggu','Disetujui','Ditolak','Dibatalkan') NOT NULL DEFAULT 'Menunggu',
  approver    VARCHAR(150) NOT NULL DEFAULT '',
  catatan     TEXT NULL,
  tgl_putusan DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (status), INDEX (mulai),
  CONSTRAINT fk_cuti_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Keterangan ketidakhadiran: penjelasan saat karyawan tidak absen sama sekali
-- (sakit/izin/keperluan pribadi/libur di luar cuti). Diisi karyawan, dikonfirmasi
-- Kepala Toko (rekomendasi) lalu HR (keputusan). Tidak memotong saldo cuti.
CREATE TABLE IF NOT EXISTS ketidakhadiran (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  tanggal       DATE NOT NULL,
  jenis         ENUM('sakit','izin','keperluan','libur','lainnya','setengah_hari','wfh','dlk') NOT NULL DEFAULT 'izin',
  sesi          ENUM('','pagi','siang') NOT NULL DEFAULT '',    -- khusus izin setengah hari
  alasan        VARCHAR(255) NOT NULL DEFAULT '',
  bukti_link    VARCHAR(1000) NOT NULL DEFAULT '',
  status        ENUM('Menunggu Rekomendasi','Menunggu HR','Disetujui','Ditolak Kepala Toko','Ditolak HR','Dibatalkan')
                NOT NULL DEFAULT 'Menunggu HR',
  rekomendasi   ENUM('','Direkomendasikan','Tidak Direkomendasikan') NOT NULL DEFAULT '',
  perekomendasi VARCHAR(150) NOT NULL DEFAULT '',
  catatan_rekomendasi VARCHAR(255) NOT NULL DEFAULT '',
  approver      VARCHAR(150) NOT NULL DEFAULT '',
  catatan_hr    VARCHAR(255) NOT NULL DEFAULT '',
  tgl_rekomendasi DATETIME NULL,
  tgl_putusan     DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (status), INDEX (tanggal), INDEX (jenis),
  CONSTRAINT fk_ket_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- BERKAS PRIVAT (dokumen karyawan, bukti reimburse, lampiran kasbon)
-- File disimpan di folder private/ di luar web root, diunduh lewat api.php
-- dengan pemeriksaan hak akses.
-- =====================================================================
CREATE TABLE IF NOT EXISTS berkas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,                       -- karyawan pemilik
  kategori    VARCHAR(20)  NOT NULL DEFAULT 'dokumen',  -- dokumen | reimburse | kasbon
  ref_id      INT NULL,                           -- id reimburse / kasbon
  jenis       VARCHAR(60)  NOT NULL DEFAULT '',   -- KTP, Kontrak, Ijazah, Nota, ...
  nama_asli   VARCHAR(200) NOT NULL DEFAULT '',
  path        VARCHAR(200) NOT NULL,
  mime        VARCHAR(80)  NOT NULL DEFAULT '',
  ukuran      INT NOT NULL DEFAULT 0,
  berlaku_sampai DATE NULL,
  diunggah_oleh INT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (kategori, ref_id),
  CONSTRAINT fk_berkas_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- INFORMASI: pengumuman & kalender libur
-- =====================================================================
CREATE TABLE IF NOT EXISTS pengumuman (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  judul       VARCHAR(150) NOT NULL,
  isi         TEXT NOT NULL,
  penting     TINYINT(1) NOT NULL DEFAULT 0,
  cabang_id   INT NULL,                           -- NULL = untuk semua lokasi
  mulai       DATE NOT NULL,
  sampai      DATE NULL,
  dibuat_oleh INT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (mulai), INDEX (sampai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pengumuman_baca (
  pengumuman_id INT NOT NULL,
  user_id       INT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pengumuman_id, user_id),
  CONSTRAINT fk_pb_p FOREIGN KEY (pengumuman_id) REFERENCES pengumuman(id) ON DELETE CASCADE,
  CONSTRAINT fk_pb_u FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hari_libur (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  tanggal  DATE NOT NULL,
  nama     VARCHAR(120) NOT NULL,
  jenis    ENUM('nasional','cuti_bersama','perusahaan') NOT NULL DEFAULT 'nasional',
  UNIQUE KEY uq_libur_tgl (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- REIMBURSE: karyawan ajukan -> HR verifikasi -> Finance setujui & bayar
-- =====================================================================
CREATE TABLE IF NOT EXISTS reimburse (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  kategori      VARCHAR(60)  NOT NULL,
  kegiatan      VARCHAR(150) NOT NULL DEFAULT '',   -- mis. nama olimpiade / event
  tanggal       DATE NOT NULL,                      -- tanggal transaksi pada nota
  nominal       BIGINT NOT NULL,
  keterangan    VARCHAR(255) NOT NULL DEFAULT '',
  bukti_link    VARCHAR(1000) NOT NULL DEFAULT '',
  status        ENUM('Menunggu HR','Menunggu Finance','Disetujui','Dibayar','Ditolak HR','Ditolak Finance','Dibatalkan')
                NOT NULL DEFAULT 'Menunggu HR',
  hr_oleh       VARCHAR(150) NOT NULL DEFAULT '',
  hr_catatan    VARCHAR(255) NOT NULL DEFAULT '',
  tgl_hr        DATETIME NULL,
  fin_oleh      VARCHAR(150) NOT NULL DEFAULT '',
  fin_catatan   VARCHAR(255) NOT NULL DEFAULT '',
  tgl_fin       DATETIME NULL,
  nominal_disetujui BIGINT NULL,
  metode_bayar  ENUM('','transfer','gaji') NOT NULL DEFAULT '',
  periode_gaji  CHAR(7) NULL,                       -- YYYY-MM bila dibayar lewat gaji
  tgl_bayar     DATE NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (status), INDEX (tanggal), INDEX (periode_gaji),
  CONSTRAINT fk_rb_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- KASBON / PINJAMAN: HR -> Finance, cicilan dipotong lewat payroll
-- =====================================================================
CREATE TABLE IF NOT EXISTS kasbon (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  nominal       BIGINT NOT NULL,
  tenor         INT NOT NULL DEFAULT 1,             -- jumlah bulan cicilan
  cicilan       BIGINT NOT NULL,                    -- potongan per bulan
  alasan        VARCHAR(255) NOT NULL DEFAULT '',
  bukti_link    VARCHAR(1000) NOT NULL DEFAULT '',
  status        ENUM('Menunggu HR','Menunggu Finance','Aktif','Lunas','Ditolak HR','Ditolak Finance','Dibatalkan')
                NOT NULL DEFAULT 'Menunggu HR',
  hr_oleh       VARCHAR(150) NOT NULL DEFAULT '',
  hr_catatan    VARCHAR(255) NOT NULL DEFAULT '',
  tgl_hr        DATETIME NULL,
  fin_oleh      VARCHAR(150) NOT NULL DEFAULT '',
  fin_catatan   VARCHAR(255) NOT NULL DEFAULT '',
  tgl_fin       DATETIME NULL,
  tgl_cair      DATE NULL,
  mulai_potong  CHAR(7) NULL,                       -- periode gaji pertama yang dipotong
  terbayar      BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (status),
  CONSTRAINT fk_ks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kasbon_bayar (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  kasbon_id   INT NOT NULL,
  periode     CHAR(7) NOT NULL,
  nominal     BIGINT NOT NULL,
  sumber      ENUM('gaji','manual') NOT NULL DEFAULT 'gaji',
  slip_id     INT NULL,
  catatan     VARCHAR(255) NOT NULL DEFAULT '',
  dicatat_oleh VARCHAR(150) NOT NULL DEFAULT '',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (kasbon_id), INDEX (periode),
  CONSTRAINT fk_kb_ks FOREIGN KEY (kasbon_id) REFERENCES kasbon(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- PAYROLL
-- =====================================================================
CREATE TABLE IF NOT EXISTS komponen_gaji (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  kode        VARCHAR(12)  NOT NULL,
  nama        VARCHAR(80)  NOT NULL,
  jenis       ENUM('tunjangan','potongan') NOT NULL DEFAULT 'tunjangan',
  hitung      ENUM('bulanan','per_hadir') NOT NULL DEFAULT 'bulanan',   -- per_hadir = nominal x hari hadir
  kena_pajak  TINYINT(1) NOT NULL DEFAULT 1,
  masuk_bpjs  TINYINT(1) NOT NULL DEFAULT 0,        -- termasuk dasar upah BPJS (tunjangan tetap)
  aktif       TINYINT(1) NOT NULL DEFAULT 1,
  urut        INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_komp_kode (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gaji_karyawan (
  user_id       INT PRIMARY KEY,
  gaji_pokok    BIGINT NOT NULL DEFAULT 0,
  ptkp          ENUM('TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3') NOT NULL DEFAULT 'TK/0',
  ikut_bpjs_kes TINYINT(1) NOT NULL DEFAULT 1,
  ikut_bpjs_tk  TINYINT(1) NOT NULL DEFAULT 1,      -- JHT, JKK, JKM
  ikut_jp       TINYINT(1) NOT NULL DEFAULT 1,
  dasar_bpjs    BIGINT NULL,                        -- isi bila dasar upah BPJS berbeda (mis. UMK)
  dapat_lembur  TINYINT(1) NOT NULL DEFAULT 1,
  kena_pph21    TINYINT(1) NOT NULL DEFAULT 1,
  diubah_oleh   VARCHAR(150) NOT NULL DEFAULT '',
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gaji_komponen (
  user_id     INT NOT NULL,
  komponen_id INT NOT NULL,
  nominal     BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, komponen_id),
  CONSTRAINT fk_gkm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_gkm_komp FOREIGN KEY (komponen_id) REFERENCES komponen_gaji(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PPh 21 & penghasilan sebelum aplikasi dipakai (untuk hitungan akhir tahun)
CREATE TABLE IF NOT EXISTS pajak_saldo_awal (
  user_id     INT NOT NULL,
  tahun       INT NOT NULL,
  bruto       BIGINT NOT NULL DEFAULT 0,
  pph21       BIGINT NOT NULL DEFAULT 0,
  iuran       BIGINT NOT NULL DEFAULT 0,             -- iuran JHT+JP pegawai
  bulan       INT NOT NULL DEFAULT 0,                -- jumlah bulan kerja tercakup
  PRIMARY KEY (user_id, tahun),
  CONSTRAINT fk_psa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_periode (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  periode     CHAR(7) NOT NULL,                     -- YYYY-MM
  status      ENUM('draft','final') NOT NULL DEFAULT 'draft',
  catatan     VARCHAR(255) NOT NULL DEFAULT '',
  dibuat_oleh VARCHAR(150) NOT NULL DEFAULT '',
  tgl_hitung  DATETIME NULL,
  final_oleh  VARCHAR(150) NOT NULL DEFAULT '',
  tgl_final   DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_periode (periode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_penyesuaian (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  periode_id  INT NOT NULL,
  user_id     INT NOT NULL,
  nama        VARCHAR(100) NOT NULL,               -- bonus, THR, honor kegiatan, koreksi...
  jenis       ENUM('tunjangan','potongan') NOT NULL DEFAULT 'tunjangan',
  nominal     BIGINT NOT NULL,
  kena_pajak  TINYINT(1) NOT NULL DEFAULT 1,
  dibuat_oleh VARCHAR(150) NOT NULL DEFAULT '',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (periode_id, user_id),
  CONSTRAINT fk_pp_periode FOREIGN KEY (periode_id) REFERENCES payroll_periode(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_slip (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  periode_id      INT NOT NULL,
  user_id         INT NOT NULL,
  gaji_pokok      BIGINT NOT NULL DEFAULT 0,
  prorata         DECIMAL(6,4) NOT NULL DEFAULT 1,
  hari_hadir      INT NOT NULL DEFAULT 0,
  hari_mangkir    INT NOT NULL DEFAULT 0,
  total_pendapatan BIGINT NOT NULL DEFAULT 0,
  total_potongan  BIGINT NOT NULL DEFAULT 0,
  bruto_pajak     BIGINT NOT NULL DEFAULT 0,
  pph21           BIGINT NOT NULL DEFAULT 0,
  pph21_metode    VARCHAR(40) NOT NULL DEFAULT '',
  iuran_pegawai   BIGINT NOT NULL DEFAULT 0,          -- JHT + JP pegawai (pengurang pajak tahunan)
  bpjs_perusahaan BIGINT NOT NULL DEFAULT 0,          -- total iuran ditanggung pemberi kerja
  thp             BIGINT NOT NULL DEFAULT 0,          -- take home pay
  ptkp            VARCHAR(5) NOT NULL DEFAULT '',
  rincian         MEDIUMTEXT NOT NULL,                -- JSON baris-baris slip
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_slip (periode_id, user_id),
  CONSTRAINT fk_ps_periode FOREIGN KEY (periode_id) REFERENCES payroll_periode(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(50) PRIMARY KEY,
  v TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS log_aktivitas (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  aksi       VARCHAR(50) NOT NULL,
  keterangan VARCHAR(255) NOT NULL DEFAULT '',
  ip         VARCHAR(45)  NOT NULL DEFAULT '',
  ua         VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (created_at),
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO settings (k,v) VALUES
  ('perusahaan','Pusat Olimpiade Sains Indonesia'), ('slogan',''),
  ('tema_default','posi'), ('warna_brand',''), ('logo_file',''), ('favicon_file',''), ('jam_masuk','08:00'), ('jam_pulang','17:00'),
  ('toleransi','10'), ('jatah_default','12'), ('min_jarak_default','2.5'),
  ('wajib_foto','1'), ('geofence_on','1'), ('titik_awal_oleh_admin','1'),
  ('office_lat',''), ('office_lng',''), ('radius','200'),
  ('target_menit_default','480'), ('lembur_min_menit','30'), ('rekomendasi_atasan','0'),
  ('batas_jam_terbuka','18'), ('libur_minggu_nonshift','1'), ('libur_nasional_aktif','1'),
  ('hari_kerja_seminggu','5'),   -- 5 = Senin–Jumat (Sabtu & Minggu libur), 6 = Senin–Sabtu
  -- payroll (lihat RUJUKAN-REGULASI.md) — dapat diubah di Pengaturan
  ('bpjs_kes_p','4'), ('bpjs_kes_k','1'), ('bpjs_kes_batas','12000000'),
  ('jht_p','3.7'), ('jht_k','2'), ('jkk','0.24'), ('jkm','0.3'),
  ('jp_p','2'), ('jp_k','1'), ('jp_batas','11086300'),
  ('lembur_pembagi','173'), ('potong_mangkir','0'), ('hari_kerja_sebulan','22'),
  ('slip_catatan','Slip ini dibuat oleh sistem dan sah tanpa tanda tangan.'),
  -- reimburse & kasbon
  ('reimburse_kategori','Transportasi|Akomodasi|Konsumsi|Perlengkapan Kegiatan|Komunikasi|Kesehatan|Lainnya'),
  ('reimburse_maks_hari','60'),
  ('kasbon_maks_kali_gaji','1'), ('kasbon_tenor_maks','12'), ('kasbon_satu_aktif','1');

INSERT INTO cabang (id, nama, tipe, radius)
SELECT 1, 'Kantor Pusat Yayasan', 'pusat', 200
WHERE NOT EXISTS (SELECT 1 FROM cabang);

INSERT INTO shift (nama, jam_masuk, jam_pulang, toleransi, lintas_hari)
SELECT * FROM (SELECT 'Shift Pagi' n, '07:00:00' a, '15:00:00' b, 10 c, 0 d) x
WHERE NOT EXISTS (SELECT 1 FROM shift);
INSERT INTO shift (nama, jam_masuk, jam_pulang, toleransi, lintas_hari)
SELECT * FROM (SELECT 'Shift Siang' n, '15:00:00' a, '23:00:00' b, 10 c, 0 d) x
WHERE NOT EXISTS (SELECT 1 FROM shift WHERE nama='Shift Siang');
INSERT INTO shift (nama, jam_masuk, jam_pulang, toleransi, lintas_hari)
SELECT * FROM (SELECT 'Shift Malam' n, '23:00:00' a, '07:00:00' b, 10 c, 1 d) x
WHERE NOT EXISTS (SELECT 1 FROM shift WHERE nama='Shift Malam');

-- komponen gaji bawaan (bisa diubah / ditambah di menu Payroll)
INSERT IGNORE INTO komponen_gaji (kode,nama,jenis,hitung,kena_pajak,masuk_bpjs,urut) VALUES
  ('TJAB','Tunjangan Jabatan','tunjangan','bulanan',1,1,10),
  ('TKOM','Tunjangan Komunikasi','tunjangan','bulanan',1,0,20),
  ('TMKN','Uang Makan','tunjangan','per_hadir',1,0,30),
  ('TTRP','Uang Transport','tunjangan','per_hadir',1,0,40),
  ('PKOP','Iuran Koperasi','potongan','bulanan',0,0,90);

-- libur nasional & cuti bersama 2026 (SKB 3 Menteri) — tambahkan tahun berikutnya di menu Kalender
INSERT IGNORE INTO hari_libur (tanggal,nama,jenis) VALUES
  ('2026-01-01','Tahun Baru 2026 Masehi','nasional'),
  ('2026-01-16','Isra Mikraj Nabi Muhammad SAW','nasional'),
  ('2026-02-16','Cuti Bersama Tahun Baru Imlek','cuti_bersama'),
  ('2026-02-17','Tahun Baru Imlek 2577 Kongzili','nasional'),
  ('2026-03-18','Cuti Bersama Hari Suci Nyepi','cuti_bersama'),
  ('2026-03-19','Hari Suci Nyepi (Tahun Baru Saka 1948)','nasional'),
  ('2026-03-20','Cuti Bersama Idulfitri 1447 H','cuti_bersama'),
  ('2026-03-21','Idulfitri 1447 Hijriah','nasional'),
  ('2026-03-22','Idulfitri 1447 Hijriah','nasional'),
  ('2026-03-23','Cuti Bersama Idulfitri 1447 H','cuti_bersama'),
  ('2026-03-24','Cuti Bersama Idulfitri 1447 H','cuti_bersama'),
  ('2026-04-03','Wafat Yesus Kristus','nasional'),
  ('2026-04-05','Kebangkitan Yesus Kristus (Paskah)','nasional'),
  ('2026-05-01','Hari Buruh Internasional','nasional'),
  ('2026-05-14','Kenaikan Yesus Kristus','nasional'),
  ('2026-05-15','Cuti Bersama Kenaikan Yesus Kristus','cuti_bersama'),
  ('2026-05-27','Iduladha 1447 Hijriah','nasional'),
  ('2026-05-28','Cuti Bersama Iduladha 1447 H','cuti_bersama'),
  ('2026-05-31','Hari Raya Waisak 2570 BE','nasional'),
  ('2026-06-01','Hari Lahir Pancasila','nasional'),
  ('2026-06-16','1 Muharam Tahun Baru Islam 1448 H','nasional'),
  ('2026-08-17','Proklamasi Kemerdekaan RI','nasional'),
  ('2026-08-25','Maulid Nabi Muhammad SAW','nasional'),
  ('2026-12-24','Cuti Bersama Natal','cuti_bersama'),
  ('2026-12-25','Kelahiran Yesus Kristus (Natal)','nasional');
