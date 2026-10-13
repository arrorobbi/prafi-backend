# Panduan Server Trans Niaga

Cara server Trans Niaga (UMKM Prafi) disusun, serta cara menjalankan, memperbarui, dan merawatnya. Ditulis untuk siapa pun yang mengambil alih pengelolaan server.

> Panduan ini disimpan dalam dua berkas yang harus selalu sama isinya: `docs/SERVER-GUIDE.md` (bahasa Inggris) dan `docs/SERVER-GUIDE.id.md` (Bahasa Indonesia). Halaman ini memiliki tombol bahasa **ID / EN** dan tombol tema **terang / gelap**; kedua pilihan diingat di browser.

> Panduan ini tidak memuat password atau rahasia apa pun. Semuanya hanya ada di dua berkas `.env` di server (lihat *Konfigurasi*). Jangan pernah memasukkan berkas `.env` ke git atau menempelkan isinya ke chat maupun tiket.

## 1. Ringkasan

| apa | nilai |
|---|---|
| Server | VPS, Ubuntu 24.04 LTS, 6 CPU, RAM 11 GB, disk 193 GB |
| IP publik | `156.67.104.230` |
| Login | SSH sebagai user `prafi` (port 22); `sudo` memerlukan password `prafi` |
| Website (frontend) | `https://transniaga.manokwarikab.go.id` |
| API (backend) | `https://api.transniaga.manokwarikab.go.id` |
| Dokumentasi API publik | `https://api.transniaga.manokwarikab.go.id/docs` |
| Panduan ini | Dashboard superadmin → **Panduan Server**, atau `https://api.transniaga.manokwarikab.go.id/api/docs/server` (khusus superadmin) |
| Panel server (Webmin) | `https://core.transniaga.manokwarikab.go.id` |

Alur sebuah kunjungan sampai ke aplikasi:

| domain | nginx (port 443, HTTPS) meneruskan ke | aplikasi |
|---|---|---|
| `transniaga.manokwarikab.go.id` | `127.0.0.1:80` | **prafi-frontend** (Next.js) |
| `api.transniaga.manokwarikab.go.id` | `127.0.0.1:4000` | **prafi-backend** (API Express + Socket.IO) |
| `core.transniaga.manokwarikab.go.id` | `127.0.0.1:10000` | Webmin |

Port 80 (HTTP biasa) dipegang oleh frontend sendiri, bukan oleh nginx. Browser memanggil `/api`, `/images`, dan `/socket.io` pada domain website itu sendiri; frontend meneruskannya ke backend (`API_URL`), sehingga backend tidak memerlukan pengaturan CORS untuk website.

## 2. Direktori proyek

| lokasi | isi |
|---|---|
| `/home/prafi/project/prafi-backend` | Kode sumber backend (TypeScript). Git: `github.com/arrorobbi/prafi-backend` |
| `/home/prafi/project/prafi-frontend` | Kode sumber frontend (Next.js). Git: `github.com/arrorobbi/prafi-frontend` |
| `/home/prafi/project/prafi-maintenance` | Halaman pemeliharaan yang tampil saat pembaruan (lihat *Memperbarui aplikasi → Halaman pemeliharaan*). Hanya git lokal |

Di dalam **prafi-backend** (setiap folder dijelaskan di bagian 12):

| lokasi | isi |
|---|---|
| `src/` | Kode sumber: `routes/` (alamat URL), `controllers/` (pemeriksaan masukan), `services/` (logika), `models/` (tabel database) |
| `dist/` | JavaScript hasil kompilasi yang dijalankan service (dibuat oleh `npm run build`; jangan diubah) |
| `images/` | **Foto yang diunggah** (produk, logo, foto profil, gambar kategori). Cadangkan bersama database |
| `db/migrations/` | Berkas SQL yang mengubah struktur database, masing-masing dijalankan sekali sesuai urutan tanggal |
| `postman/` | Koleksi Postman; sumber dokumentasi API publik |
| `documentation/` | Dokumentasi API publik hasil generate (`npm run docs`) |
| `docs/SERVER-GUIDE.md`, `docs/SERVER-GUIDE.id.md` | Panduan ini, dalam bahasa Inggris dan Bahasa Indonesia |
| `deploy/` | Unit systemd, konfigurasi nginx, dan skrip penyiapan. **Hanya ada di server, belum masuk git** |
| `.env` | Pengaturan dan rahasia backend |

Di dalam **prafi-frontend** (setiap folder dijelaskan di bagian 13):

| lokasi | isi |
|---|---|
| `src/app/` | Halaman (satu folder per alamat URL) |
| `src/components/`, `src/lib/` | Tampilan dan fungsi bersama (`lib/api.ts` = semua pemanggilan API) |
| `public/` | Berkas statis (logo, gambar panduan di `public/panduan/`) |
| `.next/` | Hasil build yang dijalankan service (dibuat oleh `npm run build`) |
| `docs/PANDUAN-PENGGUNA.md` | Panduan pengguna untuk setiap peran (Bahasa Indonesia) |
| `deploy/` | Unit systemd, konfigurasi nginx, skrip penyiapan |
| `.env` | Pengaturan frontend |

## 3. Perangkat lunak

| perangkat lunak | versi | dipakai oleh |
|---|---|---|
| Node.js 22 (nvm, `~/.nvm/versions/node/v22.23.3`) | 22.23.3 | service backend; `node` / `npm` di shell SSH Anda |
| Node.js 18 (sistem, `/usr/bin/node`) | 18.19.1 | service frontend |
| Next.js | 15.5.27 (dikunci) | frontend |
| PostgreSQL | 16 | database |
| nginx | 1.24 | HTTPS di depan aplikasi |
| certbot (snap) | | sertifikat HTTPS, diperpanjang otomatis |

> **Tetap gunakan Next.js 15.x.** Next.js 16 memerlukan Node 20.9+, sedangkan service frontend berjalan dengan Node 18: setelah di-upgrade service akan terus gagal start (`code=exited`). Khususnya, jangan jalankan `npm audit fix --force` di frontend: perintah itu memasang Next.js 16. Untuk pindah ke Next.js 16 nanti, ubah dulu `ExecStart` pada service frontend ke lokasi Node 22.

## 4. Service (start, stop, log)

Kedua aplikasi berjalan sebagai **service systemd** yang menyala saat server boot dan menyala ulang sendiri bila berhenti karena galat (setelah 5 detik).

| service | menjalankan | port |
|---|---|---|
| `prafi-backend` | `node dist/server.js` (Node 22) di `prafi-backend/` | 4000 |
| `prafi-frontend` | `next start -p 80` (Node 18) di `prafi-frontend/` | 80 |
| `prafi-maintenance` | halaman pemeliharaan; **menggantikan** `prafi-frontend` saat pembaruan (biasanya mati) | 80 |
| `nginx` | proxy HTTPS | 443 |
| `postgresql` | database | 5432 (hanya localhost) |

Status, restart, stop, dan start:

```bash
systemctl status prafi-backend prafi-frontend
sudo systemctl restart prafi-backend
sudo systemctl restart prafi-frontend
sudo systemctl stop prafi-frontend
sudo systemctl start prafi-frontend
```

Log (setiap permintaan satu baris; galat dicetak lengkap):

```bash
journalctl -u prafi-backend -f            # ikuti langsung (Ctrl+C untuk keluar)
journalctl -u prafi-backend -n 200        # 200 baris terakhir
journalctl -u prafi-frontend --since "1 hour ago"
sudo tail -f /var/log/nginx/error.log
```

Dashboard superadmin juga memiliki **Log API**: setiap pembuatan / perubahan / penghapusan oleh pengguna yang login dan setiap percobaan login, beserta galatnya (disimpan `LOG_RETENTION_DAYS` hari, bawaan 30).

Berkas service ada di `/etc/systemd/system/prafi-backend.service` dan `prafi-frontend.service` (salinannya ada di folder `deploy/` tiap proyek). Setelah mengubah salah satunya:

```bash
sudo systemctl daemon-reload
sudo systemctl restart prafi-backend
```

## 5. Memperbarui aplikasi (deploy)

Perubahan dibuat di branch git, diperiksa lewat pull request, lalu digabung ke `main` di GitHub. Perbaikan kecil boleh langsung ke `main`. Server kemudian menarik `main` dan membangun ulang.

**Cara singkat:** `bash ~/deploy.sh` mengerjakan langkah-langkah di bawah untuk kedua aplikasi: cadangan database, migrasi baru, build backend, build frontend, restart. Restart memerlukan password sudo, jadi jalankan di SSH atau terminal Webmin. Langkah manualnya:

**Backend:**

```bash
cd /home/prafi/project/prafi-backend
git switch main && git pull
npm install                      # hanya bila package.json berubah
# jalankan berkas baru di db/migrations/ di sini, bila ada (bagian 7)
npm run build
sudo systemctl restart prafi-backend
journalctl -u prafi-backend -n 30   # harus berakhir dengan "Server running on ..."
```

**Frontend:**

```bash
cd /home/prafi/project/prafi-frontend
git switch main && git pull
npm install                      # hanya bila package.json berubah
npm run build                    # 1-2 menit; versi lama tetap berjalan selama itu
sudo systemctl restart prafi-frontend
```

Aturan:

- Bila perubahan memiliki **migrasi database**, jalankan **sebelum** me-restart backend (kode baru mengharapkan tabel baru). Cadangkan dulu (bagian 7).
- Bila kedua aplikasi berubah, deploy **backend lebih dulu**.
- Bila `npm run build` gagal, jangan restart: versi yang sedang berjalan tidak tersentuh. Perbaiki galatnya dulu.
- Untuk membatalkan pembaruan yang bermasalah: `git log --oneline` untuk mencari commit sebelumnya, `git checkout <commit>`, build, lalu restart; kembali dengan `git switch main` setelah diperbaiki. Migrasi tidak ikut dibatalkan dengan cara ini: pulihkan cadangan database.

Pemeriksaan cepat setelah deploy:

```bash
curl -s https://api.transniaga.manokwarikab.go.id/api/health     # {"success":true,"data":{"status":"ok"}}
curl -s -o /dev/null -w "%{http_code}\n" https://transniaga.manokwarikab.go.id/   # 200
```

### Halaman pemeliharaan

Selama pembaruan berjalan, Anda dapat menampilkan pemberitahuan kepada pengunjung, bukan situs yang setengah diperbarui. Ini adalah aplikasi kecil terpisah, `/home/prafi/project/prafi-maintenance` (service **`prafi-maintenance`**), yang mengambil port 80 menggantikan website. Kedua service tidak dapat berjalan bersamaan: menyalakan yang satu mematikan yang lain.

```bash
sudo systemctl start prafi-maintenance   # halaman pemeliharaan AKTIF (website berhenti)
# ... git pull, migrasi, npm run build, restart prafi-backend ...
sudo systemctl start prafi-frontend      # website AKTIF kembali (halaman pemeliharaan berhenti)
```

- Halamannya berbahasa Indonesia dan Inggris (mengikuti browser pengunjung; ada tombol **ID / EN**) dan membuka situs asli dengan sendirinya begitu situs kembali.
- Setiap alamat menjawab `503`, sehingga mesin pencari tidak mengindeksnya sebagai isi situs; `/api/…` mendapat galat JSON `MAINTENANCE`.
- Perkiraan waktu selesai, pesan tambahan, dan kontak (opsional): ubah `prafi-maintenance/maintenance.json` (tanpa restart), mis. `"until": "2026-10-12T15:00:00+07:00"`.
- Halaman ini tidak pernah menyala saat boot: setelah reboot, website asli yang tampil.
- Dipasang sekali dengan `sudo bash /home/prafi/project/prafi-maintenance/deploy/setup.sh`. Rinciannya ada di `README.md` folder tersebut.

## 6. Konfigurasi (.env)

Setiap aplikasi membaca berkas `.env` miliknya saat mulai. Backend membacanya saat service start (restart setelah mengubahnya). Frontend membacanya saat **build** (jalankan `npm run build` lalu restart setelah mengubahnya).

**Backend** `/home/prafi/project/prafi-backend/.env` (semua nama ada di `.env.example`):

| pengaturan | arti |
|---|---|
| `NODE_ENV` | `production` di server. Dengan `development`, jawaban galat menyertakan rincian internal (stack trace) |
| `PORT` | 4000 (nginx mengarah ke sini) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Koneksi database (bagian 7) |
| `JWT_SECRET` | Menandatangani token login. Mengubahnya membuat semua orang keluar. Panjang dan acak; jangan dibagikan |
| `JWT_EXPIRES_IN` | Lama login bertahan **tanpa aktivitas** (`1h`); login pengguna yang aktif diperpanjang, setiap kali selama ini lagi |
| `SESSION_MAX_HOURS` | Seaktif apa pun, sesi berakhir sekian jam setelah login (bawaan 12) |
| `APP_URL` | Alamat publik API; dipakai pada tautan gambar |
| `FRONTEND_URL` | Alamat website; dipakai pada tautan di email (atur ulang kata sandi, aktivasi Disnakertrans) dan untuk gambar di panduan ini |
| `CORS_ORIGIN` | Situs lain yang boleh memanggil API dari browser (dipisah koma). Website sendiri tidak memerlukannya |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email keluar (Gmail; `SMTP_PASS` adalah *app password* Gmail). Tanpa `SMTP_HOST`, email hanya dicetak di log |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Akun superadmin yang dibuat oleh `npm run db:seed` |
| `REVALIDATE_SECRET`, `FRONTEND_REVALIDATE_URL` | Memungkinkan backend menyegarkan halaman publik website yang di-cache begitu ada perubahan; rahasia yang sama ada di `.env` frontend |
| `TURNSTILE_SECRET_KEY` | Kunci **rahasia** Cloudflare Turnstile: backend memastikan pemeriksaan "bukan robot" pada form ulasan dengannya. Kosong = pemeriksaan dilewati (ada peringatan saat start). Jaga kerahasiaannya; kunci *site* pasangannya ada di `.env` frontend |
| `LOG_RETENTION_DAYS` | Lama penyimpanan log API dalam hari (bawaan 30) |
| `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_EMAIL_TO` | Cadangan mingguan (bagian 7): folder (bawaan `~/backups/prafi`), jumlah cadangan yang disimpan (8), dan penerima email (bawaan: akun SMTP; `off` = tidak dikirim) |
| `DISK_ALERT_PERCENT`, `DISK_ALERT_EMAIL_TO` | Monitor server (bagian 14): email dikirim saat disk terisi sebanyak ini (persen, bawaan 90; 0 = tanpa peringatan), ke alamat ini (bawaan: akun SMTP; `off` = tidak dikirim) |
| `DB_LOGGING` | `true` mencetak setiap kueri SQL (hanya untuk mencari masalah) |

**Frontend** `/home/prafi/project/prafi-frontend/.env`:

| pengaturan | arti |
|---|---|
| `API_URL` | Alamat backend yang menjadi tujuan penerusan dari website |
| `SITE_URL` | Alamat website itu sendiri (tautan produk di pesan WhatsApp). Bawaan `https://transniaga.manokwarikab.go.id` |
| `NEXT_PUBLIC_ADMIN_WHATSAPP`, `NEXT_PUBLIC_ADMIN_EMAIL` | Kontak yang tampil di *Panduan → Hubungi Administrator* |
| `REVALIDATE_SECRET` | Nilai yang sama dengan di `.env` backend |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Kunci **site** Cloudflare Turnstile (publik) untuk pemeriksaan "bukan robot" pada form ulasan |
| `GOOGLE_SITE_VERIFICATION` | Kode verifikasi Google Search Console (opsional) |

## 7. Database

| apa | nilai |
|---|---|
| Mesin | PostgreSQL 16 di server ini, hanya dapat dijangkau dari server itu sendiri (localhost) |
| Database | `prafi_db` |
| User | `postgres` (dari `DB_USER`) |
| Password | `DB_PASSWORD` di `.env` backend |
| Ukuran | sekitar 17 MB (ditambah gambar yang diunggah di `prafi-backend/images/`) |

Tabel:

| tabel | isi |
|---|---|
| `users` | Akun semua peran (superadmin, disnakertrans, admin, tenant); password disimpan sebagai hash |
| `approvals` | Aktif tidaknya setiap akun atau produk, beserta alasannya |
| `tenants` | Profil UMKM (toko), satu untuk setiap akun tenant |
| `products` | Produk, masing-masing milik satu akun tenant dan berada di satu kategori |
| `product_categories` | Kategori produk beserta gambar carousel-nya |
| `reviews` | Ulasan produk dari pengunjung (1-5 bintang) |
| `images` | Gambar yang diunggah (berkasnya ada di `prafi-backend/images/`) |
| `notifications` | Notifikasi di dalam aplikasi |
| `otps`, `revoked_tokens` | Kode dan tautan email (OTP, aktivasi Disnakertrans, atur ulang kata sandi), disimpan sebagai hash; token yang sudah logout |
| `api_logs` | Catatan Log API |

Membuka konsol database (password dibaca dari `.env`, jadi tidak pernah diketik atau ditampilkan):

```bash
cd /home/prafi/project/prafi-backend
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" psql -h localhost -U postgres -d prafi_db
```

Di dalamnya: `\dt` menampilkan daftar tabel, `\d products` menampilkan satu tabel, `\q` keluar. Hanya membaca (`SELECT`) di sini kecuali Anda tahu persis akibat sebuah perubahan; aplikasilah yang menjaga data tetap konsisten.

**Cadangan mingguan otomatis.** Setiap **Minggu pukul 00:00 WIB** backend membuat cadangan sendiri (tanpa cron):

| berkas | isi |
|---|---|
| `prafi_db_<tanggal>_<jam>.sql.gz` | Seluruh database (`pg_dump`, dikompres) |
| `prafi_images_<tanggal>_<jam>.tar.gz` | Semua foto yang diunggah (`images/`). Database hanya menyimpan nama berkasnya, jadi kedua berkas ini satu pasangan |

- Disimpan di **`/home/prafi/backups/prafi/`**, hanya dapat dibaca oleh `prafi`. **8** cadangan terbaru disimpan; yang lebih lama dihapus otomatis.
- Berkas yang sama **dikirim sebagai lampiran email** ke akun Gmail milik situs (`SMTP_USER` di `.env`), subjek *Backup mingguan Trans Niaga*. Itulah salinan yang berada **di luar server**: bila server hilang, cadangannya masih ada di kotak surat tersebut. Gmail menerima 25 MB per email, jadi cadangan yang tidak muat dikirim dalam **beberapa email** (*bagian 1 dari 3*…): berkas yang melebihi batas dipotong menjadi bagian bernomor (`….tar.gz.part01`, `.part02`, …). Untuk menyatukannya, unduh semua bagian ke satu folder dan jalankan baris `cat` yang ada di email, mis. `cat prafi_images_<tanggal>.tar.gz.part* > prafi_images_<tanggal>.tar.gz`. Salinan di server selalu utuh.
- Log menampilkan setiap cadangan: `journalctl -u prafi-backend | grep backup`.
- Membuat cadangan sekarang (mis. sebelum perubahan berisiko): `npm run backup`; tanpa email: `npm run backup -- --no-email`.

> Pengaturan email tidak dapat mengunggah ke **Google Drive**: app password Gmail hanya berlaku untuk surat. Salinan yang dikirim lewat email tersimpan di penyimpanan akun Google yang sama. Unggahan Drive yang sebenarnya memerlukan service account Google Cloud atau login OAuth.

Pengaturan (opsional, `.env` backend): `BACKUP_DIR` (folder, bawaan `~/backups/prafi`), `BACKUP_KEEP` (jumlah yang disimpan, bawaan 8), `BACKUP_EMAIL_TO` (alamat lain, atau `off` agar tidak dikirim), `BACKUP_EMAIL_MAX_MB` (data berkas per email, bawaan 17; lampiran membesar sepertiga di dalam email, sehingga tetap di bawah batas 25 MB Gmail).

**Cadangan manual** (SQL biasa, mis. tepat sebelum migrasi):

```bash
cd /home/prafi/project/prafi-backend
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" pg_dump -h localhost -U postgres prafi_db > ~/backup_prafi_db_$(date +%F).sql
```

**Memulihkan** cadangan (mengganti semua data saat ini: hentikan backend dulu). Dari cadangan mingguan:

```bash
sudo systemctl stop prafi-backend
cd /home/prafi/project/prafi-backend
export PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)"
dropdb -h localhost -U postgres prafi_db
createdb -h localhost -U postgres prafi_db
gunzip -c ~/backups/prafi/prafi_db_YYYY-MM-DD_HHMM.sql.gz | psql -h localhost -U postgres -d prafi_db
tar -xzf ~/backups/prafi/prafi_images_YYYY-MM-DD_HHMM.tar.gz -C /home/prafi/project/prafi-backend
sudo systemctl start prafi-backend
```

Gunakan berkas database dan gambar **dari cadangan yang sama**. Dari cadangan yang dikirim lewat email, salin dulu kedua lampiran ke server (Webmin File Manager → *Upload*, atau `scp`). Cadangan `.sql` biasa dipulihkan dengan `psql -h localhost -U postgres -d prafi_db -f <berkas>.sql` sebagai pengganti baris `gunzip`.

**Migrasi**: perubahan struktur tabel dikirim sebagai berkas SQL di `db/migrations/` (dinamai dengan tanggal). Jalankan setiap berkas baru sekali, setelah membuat cadangan (bagian 12 mendaftar berkasnya dan menjelaskan cara menulisnya):

```bash
cd /home/prafi/project/prafi-backend
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql
```

Setiap berkas berjalan dalam satu transaksi: berakhir dengan `COMMIT`, atau tidak mengubah apa pun bila gagal.

Perintah database lainnya:

| perintah | fungsi |
|---|---|
| `npm run db:seed` | Membuat superadmin dari `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (aman diulang) |
| `npm run db:sync` | Hanya membuat tabel yang belum ada (database baru yang kosong) |
| `npm run db:sync -- --force` | **Menghapus semua data** dan membuat ulang tabel. Jangan pernah di server (ditolak bila `NODE_ENV=production`) |
| `npm run images:cleanup -- --dry-run` | Menampilkan gambar unggahan yang tidak terpakai (di bawah) tanpa menghapus apa pun |
| `npm run images:cleanup` | Menghapusnya sekarang, tanpa menunggu malam |

**Gambar yang tidak terpakai dibersihkan setiap malam.** Sebuah form mengunggah fotonya begitu dipilih dan baru menautkannya saat *Simpan*; bila tidak disimpan, browser menghapus unggahan itu lagi, tetapi itu bisa gagal (tab ditutup saat offline, galat). Setiap malam pukul **00:00 WIB** (jam server; 02:00 WIT) backend menghapus sisanya: baris gambar yang tidak dipakai foto akun, logo UMKM, produk, atau kategori mana pun, beserta berkasnya, dan berkas di `images/` yang tidak memiliki baris gambar. Hanya yang **lebih tua dari 24 jam** yang disentuh, sehingga form yang sedang diisi tidak pernah terpengaruh. Berjalan di dalam service backend (tanpa cron) dan mencatat satu baris log, mis. `[images] nightly cleanup: deleted 1 unused image(s) (ids 35) and 0 stray file(s), 1.3 MB freed` (`journalctl -u prafi-backend | grep images`). Kode: `src/services/imageCleanup.service.ts`.

> Bila suatu saat ada tabel baru yang memiliki kolom gambar, tambahkan ke daftar di `imageCleanup.service.ts` (`ORPHAN_WHERE`); kalau tidak, pembersihan akan menganggap gambar tersebut tidak terpakai.

## 8. Sertifikat HTTPS

Sertifikat Let's Encrypt untuk ketiga domain diperpanjang otomatis oleh certbot (`snap.certbot.renew.timer`, dua kali sehari). Frontend memegang port 80, jadi perpanjangan menghentikan `prafi-frontend` sebentar lalu menyalakannya lagi (hook perpanjangan di `/etc/letsencrypt/renewal-hooks/`, disiapkan oleh `deploy/setup-cert-renewal.sh`).

```bash
sudo certbot certificates            # domain dan tanggal kedaluwarsa
sudo certbot renew --dry-run         # uji perpanjangan (website mati beberapa detik)
```

**Domain baru** memerlukan sertifikat sendiri. Mode standalone certbot memerlukan port 80, jadi hentikan frontend selama prosesnya:

```bash
sudo systemctl stop prafi-frontend
sudo certbot certonly --standalone -d new.transniaga.manokwarikab.go.id
sudo systemctl start prafi-frontend
```

Lalu arahkan sebuah situs nginx ke sertifikat itu (bagian 9).

## 9. nginx (proxy HTTPS)

nginx menerima setiap kunjungan HTTPS (port **443**), membukanya dengan sertifikat, lalu meneruskannya ke aplikasi yang tepat berdasarkan nama domain (tabel di bagian 1). nginx tidak menyajikan berkas apa pun sendiri, dan **tidak** memakai port 80: HTTP biasa langsung ke frontend.

### Berkas

| lokasi | isi |
|---|---|
| `/etc/nginx/nginx.conf` | Pengaturan utama (worker, gzip, versi TLS, lokasi log). Jarang diubah |
| `/etc/nginx/sites-available/` | Satu berkas per situs: `default` (website), `api.transniaga` (API), `core.transniaga` (Webmin). Berkas `.bak` dan `core.transniaga.manokwarikab.go.id` adalah salinan lama, tidak dipakai |
| `/etc/nginx/sites-enabled/` | **Tautan** ke situs yang diaktifkan. nginx hanya memuat yang ditautkan di sini |
| `/etc/letsencrypt/live/<domain>/` | Sertifikat yang dirujuk tiap situs (dikelola certbot) |
| `/var/log/nginx/access.log`, `error.log` | Setiap permintaan / galat nginx. Dirotasi harian, yang lama berakhiran `.1`, `.2.gz`… |
| `prafi-frontend/deploy/nginx-default`, `nginx-core.transniaga`, `prafi-backend/deploy/nginx/api.transniaga` | Salinan berkas situs, disimpan bersama proyek. Perbarui saat Anda mengubah berkas yang aktif |

### Ketiga situs

| berkas situs | domain | meneruskan ke | pengaturan penting |
|---|---|---|---|
| `default` | `transniaga.manokwarikab.go.id` | `127.0.0.1:80` (frontend) | `client_max_body_size 10M` (permintaan terbesar, mis. unggah foto lewat website) |
| `api.transniaga` | `api.transniaga.manokwarikab.go.id` | `127.0.0.1:4000` (backend) | `client_max_body_size 20M`; `proxy_read_timeout 3600s` agar koneksi langsung (Socket.IO) tetap terbuka |
| `core.transniaga` | `core.transniaga.manokwarikab.go.id` | `127.0.0.1:10000` (Webmin) | `proxy_ssl_verify off` (sertifikat Webmin sendiri self-signed); `proxy_buffering off` |

Setiap situs meneruskan keterangan pengunjung ke aplikasi (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`; berkat ini Log API menampilkan IP pengunjung yang sebenarnya) serta header `Upgrade` / `Connection` yang diperlukan WebSocket. Pertahankan baris-baris ini saat mengubah berkas.

### Mengubah sebuah situs

Selalu uji sebelum reload: satu berkas yang rusak dapat mematikan **ketiga** situs.

```bash
sudo cp /etc/nginx/sites-available/default ~/nginx-default.bak     # 1. cadangkan
sudo nano /etc/nginx/sites-available/default                       # 2. ubah (atau Webmin File Manager)
sudo nginx -t                                                      # 3. harus menampilkan "syntax is ok" dan "test is successful"
sudo systemctl reload nginx                                        # 4. terapkan, tanpa memutus pengunjung
```

Bila `nginx -t` gagal, belum ada yang berubah: perbaiki baris yang disebutnya, atau kembalikan cadangan (`sudo cp ~/nginx-default.bak /etc/nginx/sites-available/default`). Gunakan `reload`, bukan `restart`: reload tetap menjalankan pengaturan lama bila yang baru salah.

Baris yang berakhiran `# managed by Certbot` adalah pengaturan sertifikat: biarkan apa adanya.

### Perubahan yang sering dilakukan

**Ukuran unggahan.** Unggahan foto melewati tiga batas: nginx (`client_max_body_size`, 10M website / 20M API), lalu batas backend sendiri yaitu **5 MB per gambar** (`MAX_IMAGE_SIZE` di `src/config/upload.ts`). Yang terkecil yang berlaku. Untuk mengizinkan foto lebih besar, naikkan batas backend (lalu build ulang), dan jaga kedua batas nginx tetap di atasnya.

**Mematikan / menyalakan sebuah situs.** Hapus atau buat lagi tautannya, lalu uji dan reload:

```bash
sudo rm /etc/nginx/sites-enabled/core.transniaga                                              # mati
sudo ln -s /etc/nginx/sites-available/core.transniaga /etc/nginx/sites-enabled/core.transniaga  # nyala
sudo nginx -t && sudo systemctl reload nginx
```

**Menambah domain** (mis. subdomain baru untuk aplikasi lain):

1. Arahkan DNS domain (A record) ke `156.67.104.230`.
2. Dapatkan sertifikatnya (bagian 8).
3. Salin berkas situs yang ada sebagai awal, mis. `sudo cp /etc/nginx/sites-available/api.transniaga /etc/nginx/sites-available/new.transniaga`, lalu ubah `server_name`, port `proxy_pass`, dan dua lokasi `ssl_certificate`.
4. Tautkan ke `sites-enabled`, lalu `sudo nginx -t && sudo systemctl reload nginx`.

### Pemeriksaan dan log

```bash
systemctl status nginx
sudo nginx -T | less                        # konfigurasi lengkap yang benar-benar dipakai nginx
sudo tail -f /var/log/nginx/error.log       # galat secara langsung (Ctrl+C untuk keluar)
sudo tail -f /var/log/nginx/access.log      # setiap permintaan
```

**502 Bad Gateway** berasal dari nginx: aplikasi di belakangnya tidak menjawab. Periksa service aplikasi tersebut (bagian 4), bukan nginx.

Perlu diketahui: frontend (bukan nginx) memegang port 80, jadi frontend sendiri yang mengalihkan `http://transniaga.manokwarikab.go.id/...` ke `https://` (redirect 308, di `prafi-frontend/src/middleware.ts`). Nama host lain pada port 80 tidak dialihkan: `http://api.transniaga…` dijawab oleh frontend melalui proxy `/api` website, dan `http://localhost` / `http://127.0.0.1` tetap HTTP biasa (backend memakainya untuk menyegarkan halaman yang di-cache).

## 10. Webmin (panel server)

Webmin adalah panel web untuk server: melihat database, mengelola berkas, dan membuka terminal dari browser, tanpa program SSH.

| apa | nilai |
|---|---|
| Alamat | `https://core.transniaga.manokwarikab.go.id` (Webmin 2.670) |
| Login | Akun Linux di server ini yang memiliki akses Webmin (mis. `prafi`); password yang sama dengan SSH |
| Menu | Sidebar kiri, berkelompok (*System*, *Servers*, *Tools*…). Ketik nama modul di kotak pencarian sidebar untuk menemukannya dengan cepat |

> Webmin bekerja dengan **hak administrator penuh (root)**. Satu klik yang salah dapat menghapus berkas atau data seluruh server. Baca sebelum mengonfirmasi, cadangkan sebelum mengubah (bagian 7), dan logout (menu kiri atas → *Logout*) setelah selesai.

### PostgreSQL (database)

Lokasi berkas PostgreSQL di server:

| lokasi | isi |
|---|---|
| `/etc/postgresql/16/main/postgresql.conf` | Pengaturan utama (port, memori, alamat yang didengarkan) |
| `/etc/postgresql/16/main/pg_hba.conf` | Siapa yang boleh terhubung dari mana, dan dengan cara apa (aturan password) |
| `/var/lib/postgresql/16/main/` | Berkas data semua database. **Jangan pernah mengubah atau menghapus apa pun di sini secara manual**: gunakan alat database (dan `pg_dump` untuk cadangan) |
| `/var/log/postgresql/postgresql-16-main.log` | Log PostgreSQL sendiri (start, stop, galat, login gagal) |

Buka **Servers → PostgreSQL Database Server**:

1. Halaman menampilkan daftar database. Database aplikasi adalah **`prafi_db`**; `postgres`, `template0`, dan `template1` milik PostgreSQL sendiri, biarkan saja.
2. Bila Webmin meminta login database, gunakan user `postgres` dan `DB_PASSWORD` dari `.env` backend (atur sekali di *Module Config*).
3. Klik **`prafi_db`** untuk melihat tabelnya (bagian 7 menjelaskan isi masing-masing). Klik sebuah tabel, lalu **View Data** untuk melihat barisnya.
4. **Execute SQL** menjalankan kueri, mis. `SELECT name, price FROM products ORDER BY created_at DESC LIMIT 20;`. Gunakan untuk membaca (`SELECT`). Jangan mengubah baris di sini: aplikasi menjaga data yang berkaitan tetap bersama (approval untuk setiap produk, berkas gambar dengan baris gambarnya…), dan perubahan manual dapat merusaknya.
5. **Backup Database** membuat berkas dump, sama seperti perintah `pg_dump` di bagian 7. Pilih lokasi berkas seperti `/home/prafi/backup_prafi_db_YYYY-MM-DD.sql`.
6. **Restore Database** mengganti data dengan sebuah cadangan. Hentikan backend dulu (`sudo systemctl stop prafi-backend`) dan lakukan hanya untuk pulih dari masalah.
7. Untuk mengubah pengaturan PostgreSQL, ubah berkas di atas (mis. dengan File Manager), lalu restart PostgreSQL dari halaman ini (atau `sudo systemctl restart postgresql`). Backend tersambung kembali dengan sendirinya; restart backend bila tidak.

### File Manager

Buka **Tools → File Manager** untuk menjelajah, mengubah, mengunggah, dan mengunduh berkas.

| folder | yang ada di sana |
|---|---|
| `/home/prafi/project/prafi-backend` | Backend: `.env`, `src/`, `images/` (foto unggahan), `db/migrations/`, `docs/SERVER-GUIDE.md` |
| `/home/prafi/project/prafi-frontend` | Frontend: `.env`, `src/`, `public/` |
| `/home/prafi/` | Folder home, tempat yang baik untuk cadangan |
| `/etc/nginx/sites-enabled/` | Konfigurasi nginx (HTTPS) ketiga domain |
| `/etc/systemd/system/` | `prafi-backend.service`, `prafi-frontend.service` |
| `/etc/postgresql/16/main/`, `/var/log/postgresql/` | Konfigurasi dan log PostgreSQL (di atas) |

Pekerjaan yang sering dilakukan:

- **Mengubah berkas** (mis. `.env`): pilih berkasnya, lalu *Edit*; simpan. Kemudian lakukan yang disebut di bagian 6: restart backend, atau build ulang dan restart frontend. Mengubah `.env` dengan cara ini tidak masalah; jangan mengubah kode sumber di sini (perubahan kode lewat git, bagian 5).
- **Mengunduh** cadangan atau log: pilih berkasnya, lalu *Download*.
- **Mengunggah** berkas: buka folder tujuan, lalu *Upload*.
- **Berkas tersembunyi** (nama diawali titik, seperti `.env`): aktifkan tampilan berkas tersembunyi di pengaturan File Manager bila tidak muncul.

> Berkas yang dibuat atau diunggah lewat Webmin dimiliki oleh **root**. Aplikasi berjalan sebagai user `prafi` dan tidak dapat mengubah berkas milik root: mis. foto produk di `images/` atau `.env` baru akan gagal. Setelah mengunggah atau membuat apa pun di dalam `/home/prafi/project`, ubah pemiliknya menjadi `prafi` (pilih berkas → *Change ownership* → user dan group `prafi`), atau di terminal: `sudo chown -R prafi:prafi /home/prafi/project`.

### Terminal

Buka **Tools → Terminal** untuk shell di server, sama seperti SSH. Semua perintah di panduan ini dapat dijalankan di sini.

- Terminal dimulai sebagai **root**. Pindah dulu ke user aplikasi, agar `node` / `npm` (Node 22 dari nvm) dan git berfungsi serta berkas baru mendapat pemilik yang benar:

```bash
su - prafi
cd /home/prafi/project/prafi-backend
```

- Sebagai `prafi`, perintah yang mengubah sistem tetap memerlukan `sudo` (mis. `sudo systemctl restart prafi-backend`), dengan password `prafi`.
- `exit` kembali ke root, atau menutup terminal.
- Build yang lama (`npm run build`) hanya terus berjalan selama tab terbuka: biarkan terbuka sampai selesai. Untuk pekerjaan yang harus tetap berjalan setelah browser ditutup, gunakan SSH.
- **Tools → Command Shell** menjalankan satu perintah dan menampilkan hasilnya, praktis untuk pemeriksaan cepat seperti `systemctl status prafi-backend`.

## 11. Menjalankan di komputer sendiri (development)

Di komputer Anda sendiri dengan Node 22 dan PostgreSQL:

```bash
# backend
cd prafi-backend
cp .env.example .env               # isi DB_*, JWT_SECRET, SEED_ADMIN_*
npm install
npm run db:sync && npm run db:seed
npm run dev                        # http://localhost:4000 (restart setiap kali disimpan)

# frontend (terminal kedua)
cd prafi-frontend
cp .env.example .env.local         # API_URL=http://localhost:4000
npm install
npm run dev                        # http://localhost:3000
```

| perintah | backend | frontend |
|---|---|---|
| `npm run dev` | server development, restart setiap kali disimpan | server development, muat ulang otomatis |
| `npm run build` | mengompilasi `src/` menjadi `dist/` | build produksi ke `.next/` |
| `npm start` | menjalankan `dist/` | menjalankan hasil build di port 80 |
| `npm run typecheck` / `npm run lint` | pemeriksaan tipe | lint |
| `npm run docs` | membuat ulang dokumentasi API publik | |

## 12. Backend (Express): struktur dan pekerjaan sehari-hari

Backend adalah API di `https://api.transniaga.manokwarikab.go.id`: aplikasi **Express 5** yang ditulis dengan **TypeScript**, memakai **Sequelize** untuk database PostgreSQL, **Socket.IO** untuk notifikasi langsung, dan **nodemailer** untuk email. Folder: `/home/prafi/project/prafi-backend`.

### Cara sebuah permintaan ditangani

Setiap permintaan melewati rantai yang sama. Dengan mengetahuinya, Anda tahu berkas mana yang perlu dibuka:

| langkah | folder | yang terjadi di sana |
|---|---|---|
| 1. Route | `src/routes/` | Mencocokkan URL dan metode, serta menyebut siapa yang boleh memanggilnya (`authenticate`, `authorize(...roles)`) |
| 2. Middleware | `src/middlewares/` | Memeriksa token login dan peran, mencatat permintaan, menangani unggahan foto |
| 3. Controller | `src/controllers/` | Membaca dan memvalidasi masukan (400 dengan pesan per field dalam Bahasa Indonesia bila salah), memanggil service, mengirim jawaban JSON |
| 4. Service | `src/services/` | Pekerjaan dan aturan yang sebenarnya: membaca dan menulis database, mengirim email dan notifikasi |
| 5. Model | `src/models/` | Satu berkas per tabel database (kolom, relasi) |
| 6. Penangan galat | `src/middlewares/errorHandler.ts` | Mengubah galat apa pun menjadi jawaban baku `{ "success": false, "error": { "code", "message", "details" } }` |

### Folder dan berkas

| lokasi | fungsi |
|---|---|
| `src/server.ts` | Awal program: menyambung ke database, membuka port 4000 dan Socket.IO, memulai pekerjaan terjadwal |
| `src/app.ts` | Aplikasi Express: header keamanan, CORS, `/images` (foto unggahan), `/docs` (dokumentasi API publik), route `/api`, penangan galat |
| `src/config/` | `env.ts` membaca `.env` (pengaturan wajib yang hilang menghentikan start), `database.ts` koneksi database, `upload.ts` batas foto (5 MB, jenis yang diizinkan) dan folder `images/` |
| `src/constants/` | Daftar tetap: `roles.ts` (empat peran dan **siapa boleh melakukan apa**), `notifications.ts`, `realtime.ts` (nama event langsung), `products.ts` (aturan label *rekomendasi*) |
| `src/routes/` | Satu berkas per bidang: `auth`, `user`, `approval`, `product`, `productCategory`, `review`, `tenant`, `image`, `notification`, `stats`, `apiLog`, `landing` (halaman publik), `serverDocs` (panduan ini), `serverMonitor` (Monitor Server). `index.ts` menggabungkannya di bawah `/api` |
| `src/controllers/` | Pemeriksaan masukan dan jawaban, satu berkas per bidang |
| `src/services/` | Logika, satu berkas per bidang, ditambah `mail.service.ts`, `emailVerification.service.ts` (OTP, aktivasi Disnakertrans), `passwordReset.service.ts`, `backup.service.ts`, `imageCleanup.service.ts`, `apiLog.service.ts`, `serverMonitor.service.ts`, `loginGuard.service.ts`, `faceDetection.service.ts` |
| `src/models/` | Tabel database dalam bentuk kode; `index.ts` menghubungkannya |
| `src/middlewares/` | `auth.ts` (token dan peran), `requestLogger.ts` (baris konsol dan Log API), `upload.ts`, `errorHandler.ts`, `landingRefresh.ts` (memberi tahu website agar menyegarkan halaman yang di-cache) |
| `src/mail/templates.ts` | Semua email (Bahasa Indonesia): subjek, HTML, dan teks biasa |
| `src/realtime/socket.ts` | Socket.IO: notifikasi langsung, mengakhiri sesi |
| `src/utils/` | Fungsi bantu kecil: `jwt.ts`, `markdown.ts`, `turnstile.ts` (pemeriksaan "bukan robot"), `clientIp.ts`, `readablePassword.ts`, `revalidateLanding.ts` |
| `src/scripts/` | Perintah yang dijalankan manual (`seed.ts`, `sync.ts`, `backup.ts`, `cleanupImages.ts`) dan pembuat dokumentasi API (`docs.ts`, `docs.id.md`, `docs.flows.ts`) |
| `src/types/` | Deklarasi TypeScript (isi `req.user`) |
| `db/migrations/` | Berkas SQL yang mengubah struktur tabel (di bawah) |
| `dist/` | Program hasil kompilasi yang dijalankan service. Dibuat oleh `npm run build`; jangan diubah |
| `images/` | Foto unggahan. Tidak masuk git; bagian dari setiap cadangan |
| `postman/` | Koleksi dan environment Postman: sumber dokumentasi API publik |
| `documentation/` | Dokumentasi API publik hasil generate (`/docs`). Dibuat oleh `npm run docs`; jangan diubah |
| `docs/` | Panduan ini: `SERVER-GUIDE.md` (Inggris), `SERVER-GUIDE.id.md` (Bahasa Indonesia), dan `server-page/` (halaman yang menampilkannya) |
| `deploy/` | Berkas service systemd, berkas situs nginx, dan skrip penyiapan. Hanya ada di server, tidak masuk git |
| `.env`, `.env.example` | Pengaturan dan rahasia (bagian 6); berkas contoh memuat semua nama tanpa rahasianya |
| `package.json`, `tsconfig.json` | Dependensi dan perintah; pengaturan TypeScript |

### Perintah

Jalankan di `/home/prafi/project/prafi-backend` sebagai user `prafi`.

| perintah | fungsi |
|---|---|
| `npm run build` | Mengompilasi `src/` menjadi `dist/` (sekitar 10 detik). Diperlukan setelah setiap perubahan kode |
| `npm run typecheck` | Memeriksa galat tipe pada kode tanpa membangun |
| `npm run dev` | Hanya development: berjalan langsung dari `src/` dan restart setiap kali disimpan |
| `npm start` | Menjalankan `dist/server.js` (yang dilakukan service) |
| `npm run docs` | Membuat ulang dokumentasi API publik dari koleksi Postman |
| `npm run db:seed` | Membuat akun superadmin (aman diulang) |
| `npm run db:sync` | Membuat tabel yang belum ada (hanya untuk database baru yang kosong) |
| `npm run backup` | Membuat cadangan sekarang (bagian 7) |
| `npm run images:cleanup` | Menghapus foto unggahan yang tidak terpakai sekarang (bagian 7) |

### Build dan restart

Service menjalankan berkas hasil kompilasi, jadi perubahan di `src/` tidak berpengaruh sampai di-build **dan** service di-restart:

```bash
cd /home/prafi/project/prafi-backend
npm install            # hanya bila package.json berubah
npm run build          # berhenti dengan pesan galat bila kodenya salah; versi yang berjalan tidak tersentuh
sudo systemctl restart prafi-backend
journalctl -u prafi-backend -n 20     # harus berakhir dengan "Server running on ..."
```

Skrip bantu `bash ~/deploy.sh` mengerjakan seluruh pembaruan sekaligus: cadangan database, migrasi baru, `npm install` bila ada paket baru, build backend, build frontend, lalu restart (skrip mencetak perintah restart bila tidak dapat meminta password sudo).

### Migrasi database

**Migrasi** adalah berkas SQL yang mengubah struktur tabel (kolom baru, tabel baru, tipe yang berbeda). Database di server tidak pernah diubah oleh `db:sync`: setiap perubahan struktur adalah satu berkas di `db/migrations/`, dijalankan sekali.

Berkas sejauh ini, sesuai urutan dijalankannya:

| berkas | perubahan |
|---|---|
| `20261008_price_instagram_reviews.sql` | Harga produk dan tanda *rekomendasi*, tautan Instagram, ulasan produk |
| `20261008_2_image_uploader.sql` | Siapa yang mengunggah tiap gambar |
| `20261008_3_tenant_links.sql` | Tautan Google Bisnis dan Shopee; Instagram menjadi opsional |
| `20261008_4_api_log_summary.sql`, `20261008_5_api_log_auth_email.sql` | Rincian lebih banyak di Log API |
| `20261009_product_categories.sql` | Kategori produk dengan gambar |
| `20261010_review_moderation.sql` | Pelaporan dan penyembunyian ulasan |
| `20261012_google_business_link_text.sql` | Tautan Google Bisnis yang lebih panjang |
| `20261013_tenant_links_optional.sql` | Semua tautan UMKM menjadi opsional |

**Menjalankan migrasi** (selalu cadangkan dulu, dan jalankan **sebelum** me-restart backend dengan kode baru):

```bash
cd /home/prafi/project/prafi-backend
npm run backup -- --no-email
PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)" psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql
```

**Menulis migrasi baru:**

1. Beri nama `YYYYMMDD_apa_yang_dilakukan.sql` agar berkas terurut menurut tanggal.
2. Awali dengan komentar: tanggal, apa yang berubah dan mengapa, serta perintah untuk menjalankannya.
3. Bungkus beberapa pernyataan dalam `BEGIN;` … `COMMIT;`, sehingga kegagalan tidak mengubah apa pun.
4. Ubah model yang sesuai di `src/models/` dalam commit yang sama, agar kode dan database tetap sama.
5. Coba pada **salinan** database sebelum yang asli:

```bash
export PGPASSWORD="$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)"
createdb -h localhost -U postgres prafi_test
pg_dump -h localhost -U postgres prafi_db | psql -q -h localhost -U postgres -d prafi_test
psql -h localhost -U postgres -d prafi_test -v ON_ERROR_STOP=1 -f db/migrations/<file>.sql
dropdb -h localhost -U postgres prafi_test        # setelah selesai
```

6. Tambahkan satu baris untuknya di `~/deploy.sh` (baris-baris `migrate`), dengan kueri yang menunjukkan apakah migrasi itu sudah diterapkan.

> Tidak ada tabel yang mencatat migrasi mana yang sudah dijalankan. Bila ragu, lihat strukturnya: `\d tenants` di konsol database menampilkan kolom yang seharusnya ditambah atau diubah oleh sebuah migrasi.

### Pekerjaan yang berjalan sendiri

Semuanya berjalan di dalam service backend; tidak ada cron yang perlu diurus. Semua waktu mengikuti jam server (WIB).

| pekerjaan | kapan | kode |
|---|---|---|
| Menghapus foto unggahan yang tidak terpakai | setiap malam, 00:00 | `src/services/imageCleanup.service.ts` |
| Cadangan database dan foto, dikirim lewat email | setiap Minggu, 00:00 | `src/services/backup.service.ts` |
| Menghapus baris Log API yang lama (lebih tua dari `LOG_RETENTION_DAYS`) | harian | `src/services/apiLog.service.ts` |
| Pemeriksaan disk, dengan email saat hampir penuh | setiap 10 menit | `src/services/serverMonitor.service.ts` |

### Menambah atau mengubah endpoint

1. Perlu perubahan tabel? Tulis migrasinya dan perbarui modelnya (di atas).
2. Letakkan aturannya di **service**, pemeriksaan masukan di **controller**, dan URL beserta peran yang diizinkan di **route** (peran berasal dari `src/constants/roles.ts`).
3. Pesan untuk pengguna ditulis dalam Bahasa Indonesia; komentar kode dalam bahasa Inggris.
4. Tambahkan permintaannya ke koleksi Postman (`postman/Prafi-API.postman_collection.json`), teks Indonesianya ke `src/scripts/docs.id.md`, lalu jalankan `npm run docs`.
5. `npm run typecheck`, coba pada salinan database, lalu build dan restart.

## 13. Frontend (Next.js): struktur dan pekerjaan sehari-hari

Frontend adalah website di `https://transniaga.manokwarikab.go.id`: aplikasi **Next.js 15** (App Router) dengan **React 19** dan **Tailwind CSS 4**. Folder: `/home/prafi/project/prafi-frontend`. Frontend tidak menyimpan data sendiri: semuanya berasal dari API backend.

### Cara sebuah halaman mendapatkan datanya

| jenis halaman | tempat digambar | cara mendapatkan data |
|---|---|---|
| Halaman publik (Beranda, Produk, detail produk, UMKM, Panduan) | Di server, sehingga mesin pencari dan pratinjau tautan mendapat halaman yang lengkap | `src/lib/server-api.ts` memanggil backend; jawabannya di-cache 60 detik dan langsung disegarkan saat backend melaporkan perubahan (`POST /internal/revalidate`) |
| Dashboard, login, halaman akun | Di browser pengunjung | `src/lib/api.ts` memanggil `/api/...` dengan token login yang disimpan di browser |

Browser selalu memanggil `/api`, `/images`, dan `/socket.io` pada domain website sendiri; `next.config.ts` meneruskannya ke backend (`API_URL`).

### Folder dan berkas

| lokasi | fungsi |
|---|---|
| `src/app/` | **Halaman.** Satu folder per alamat: `src/app/tenant/produk/page.tsx` adalah `/tenant/produk`. `layout.tsx` membungkus halaman di bawahnya; `loading.tsx` adalah kerangka abu-abu yang tampil saat halaman dimuat |
| `src/app/(public)/` | Halaman publik dengan header dan footer situs: `page.tsx` (Beranda), `produk/`, `umkm/`, `panduan/`. Tanda kurung mengelompokkan halaman tanpa menambah alamat |
| `src/app/admin/`, `disnakertrans/`, `superadmin/`, `tenant/` | Satu dashboard per peran. Setiap `layout.tsx` memuat **menu sidebar** peran tersebut |
| `src/app/login/`, `register/`, `verifikasi/`, `aktivasi/`, `lupa-password/`, `reset-password/`, `akun/` | Masuk, daftar, OTP email, aktivasi Disnakertrans, halaman kata sandi |
| `src/app/robots.ts`, `sitemap.ts`, `manifest.ts`, `opengraph-image.tsx` | Berkas untuk mesin pencari dan gambar bawaan saat tautan dibagikan |
| `src/app/internal/revalidate/` | Alamat yang dipanggil backend untuk menyegarkan halaman yang di-cache |
| `src/app/globals.css` | Warna dan gaya dasar seluruh situs |
| `src/components/site/` | Halaman publik: header, footer, carousel, kartu produk, ulasan |
| `src/components/dashboard/` | Dashboard: kerangka sidebar, tabel, form, grafik, notifikasi |
| `src/components/auth/` | Bingkai login, langkah pendaftaran, form OTP |
| `src/components/shadcn/` | Komponen dasar (tombol, input, dialog, tabel…). **Ditulis manual**: jangan jalankan perintah shadcn, karena akan menimpanya |
| `src/components/Icons.tsx` | Semua ikon (SVG inline) |
| `src/lib/api.ts` | **Semua pemanggilan API** dari browser, satu fungsi per endpoint |
| `src/lib/server-api.ts` | Pemanggilan API untuk halaman publik (sisi server, di-cache) |
| `src/lib/auth.tsx` | Sesi login di browser |
| `src/lib/guides.tsx` | Isi Panduan (bagian 15) |
| `src/lib/seo.tsx` | Judul, deskripsi, dan data terstruktur untuk mesin pencari |
| `src/lib/format.ts`, `types.ts`, `adCalculator.ts`, … | Format (Rupiah, tanggal), tipe data, rumus kalkulator profit |
| `src/middleware.ts` | Mengalihkan kunjungan `http://` biasa ke `https://` |
| `next.config.ts` | Penerusan `/api` dan header "jangan diindeks" untuk halaman pribadi |
| `public/` | Berkas yang disajikan apa adanya: logo, ikon, tangkapan layar panduan di `public/panduan/` |
| `.next/` | Situs hasil build yang dijalankan service. Dibuat oleh `npm run build`; jangan diubah |
| `docs/PANDUAN-PENGGUNA.md` | Panduan pengguna dalam bentuk dokumen |
| `deploy/` | Berkas service systemd, berkas situs nginx, skrip penyiapan |
| `.env`, `.env.example` | Pengaturan (bagian 6) |

### Perintah

Jalankan di `/home/prafi/project/prafi-frontend` sebagai user `prafi`.

| perintah | fungsi |
|---|---|
| `npm run build` | Membangun situs ke `.next/` (1 sampai 2 menit). Diperlukan setelah setiap perubahan, termasuk `.env` |
| `npm run lint` | Memeriksa kesalahan pada kode (import yang hilang, variabel tidak terpakai) |
| `npm run dev` | Hanya development: `http://localhost:3000` dengan muat ulang otomatis |
| `npm start` | Menjalankan situs hasil build di port 80 (yang dilakukan service) |

### Build dan restart

```bash
cd /home/prafi/project/prafi-frontend
npm install            # hanya bila package.json berubah
npm run build          # situs tetap menjalankan build lama selama itu; galat di sini tidak mengubah apa pun
sudo systemctl restart prafi-frontend
```

Hal yang perlu diingat:

- **Pengaturan dibaca saat build.** Setelah mengubah `.env` frontend, lakukan build lalu restart, bukan hanya restart.
- **Frontend tidak memiliki migrasi.** Perubahan database adalah urusan backend (bagian 12). Bila sebuah pembaruan mengubah keduanya, deploy backend lebih dulu.
- **Tetap di Next.js 15** (bagian 3), dan jangan pernah menjalankan `npm audit fix --force` di sini.
- Untuk pembaruan yang terlihat pengunjung, nyalakan dulu **halaman pemeliharaan** (bagian 5) lalu nyalakan kembali website setelahnya.

### Perubahan yang sering dilakukan

| Saya ingin… | tempatnya |
|---|---|
| Mengubah teks pada sebuah halaman | Berkas halaman di `src/app/…/page.tsx`, atau komponen yang dipakainya di `src/components/` |
| Menambah menu di sebuah dashboard | Daftar `NAV` di `src/app/<peran>/layout.tsx` peran tersebut, ditambah folder baru berisi `page.tsx` |
| Memanggil endpoint API baru | Tambahkan fungsi di `src/lib/api.ts` (dan tipenya di `src/lib/types.ts`) |
| Mengubah warna atau huruf | `src/app/globals.css` |
| Membuat gambar membesar saat diklik | Gunakan `<Thumb zoom … />` (`src/components/ui.tsx`); popup-nya ada di `src/components/Lightbox.tsx`. Bukan untuk gambar di dalam tautan atau kartu yang dapat diklik |
| Menjadikan seluruh kartu satu tautan | Class `card-link` pada kartu dan `card-link-main` pada tautan yang diikutinya (dijelaskan di `globals.css`) |
| Mengubah halaman bantuan | `src/lib/guides.tsx` (bagian 15) |
| Mengubah kontak yang tampil di Panduan | `NEXT_PUBLIC_ADMIN_WHATSAPP`, `NEXT_PUBLIC_ADMIN_EMAIL` di `.env`, lalu build |
| Mengubah yang dilihat mesin pencari | `src/lib/seo.tsx` dan `metadata` halaman; README memiliki bagian *SEO* |

## 14. Fitur sistem

Yang dilakukan sistem ini, menurut penggunanya. Gambarnya adalah tangkapan layar website dengan data contoh (`prafi-frontend/public/panduan/fitur-*.jpg`); klik sebuah gambar untuk memperbesarnya. Petunjuk langkah demi langkah untuk pengguna ada di **Panduan** website (`/panduan`) dan di `prafi-frontend/docs/PANDUAN-PENGGUNA.md`.

### Peran

| peran | cara akun dibuat | yang dilakukan |
|---|---|---|
| Pengunjung | tanpa akun | Melihat produk dan UMKM, menulis ulasan |
| Tenant (penjual / UMKM) | mendaftar di `/register`, mengonfirmasi email dengan OTP | Profil toko, produk, ulasan produk sendiri, kalkulator profit |
| Admin | mendaftar di `/register/admin` (OTP), lalu **diaktifkan oleh Disnakertrans** | Menyetujui produk, mengelola kategori, mengaktifkan penjual, memutuskan ulasan yang dilaporkan |
| Disnakertrans | dibuat oleh superadmin; menerima kata sandi sementara dan tautan aktivasi lewat email | Mengaktifkan admin; juga semua yang dilakukan admin untuk produk, kategori, dan ulasan |
| Superadmin | dibuat di server (`npm run db:seed`) | Membuat akun Disnakertrans, membaca semuanya, Log API, panduan ini |

### Pengunjung (tanpa login)

- **Beranda**: carousel kategori produk beserta produk dari kategori yang sedang tampil, produk rekomendasi, dan daftar UMKM. Produk mendapat label *rekomendasi* (ikon jempol) bila memiliki minimal 3 ulasan dengan rata-rata 4,8 bintang atau lebih.

![Beranda: menu, carousel kategori, dan produk](panduan/fitur-beranda.jpg)

- **Pencarian**: ikon kaca pembesar di header mencari produk dan toko.

![Kotak pencarian](panduan/fitur-cari.jpg)

- **Produk**: semua produk yang sudah disetujui, **rating tertinggi lebih dulu**, dengan pilihan *terbaru*, kotak pencarian, dan filter kategori.

![Halaman Produk diurutkan menurut rating](panduan/fitur-produk-urut.jpg)

- **Halaman produk**: foto, harga, deskripsi, penjual, dan **tombol kontak** (WhatsApp dengan pesan siap kirim, Shopee, Instagram, Google Bisnis, Facebook, lokasi) untuk tautan yang diisi penjual.

![Halaman produk](panduan/fitur-produk-detail.jpg)

- **Ulasan tanpa login**: 1 sampai 5 bintang dan teks minimal 3 kata, setelah pemeriksaan "bukan robot" (Cloudflare Turnstile). Satu ulasan per produk per hari dari browser dan jaringan yang sama.

![Ulasan dan form ulasan di halaman produk](panduan/fitur-ulasan.jpg)

- **Halaman UMKM**: profil toko, alamat, jam buka, tombol kontak, rating, dan semua produknya.

![Halaman sebuah UMKM](panduan/fitur-umkm.jpg)

- **Panduan**: topik bantuan dengan tangkapan layar langkah demi langkah, syarat dan ketentuan, kebijakan privasi, dan kontak administrator.

### Penjual (tenant)

- **Pendaftaran bertahap** dengan OTP email (15 menit); akun langsung aktif.

![Pendaftaran penjual: informasi akun](panduan/fitur-daftar.jpg)

![OTP email](panduan/fitur-daftar-otp.jpg)

- **Dashboard**: jumlah produk menurut status (aktif, menunggu, ditolak, dinonaktifkan), dengan jalan pintas untuk mengubah profil dan menambah produk.

![Dashboard penjual](panduan/fitur-tenant-dashboard.jpg)

- **Profil UMKM**: logo, nama, wilayah, deskripsi, alamat, jam buka; nomor WhatsApp dan semua tautan bersifat opsional. Produk dapat ditambahkan setelah profil dan foto akun lengkap.

![Form Profil UMKM](panduan/fitur-profil-umkm.jpg)

- **Produk**: tambah dengan foto, harga, kategori, deskripsi; produk baru atau yang diubah menunggu persetujuan (*Menunggu Konfirmasi*). Produk yang ditolak menampilkan alasannya dan dapat diperbaiki lalu diajukan lagi.

![Menambah produk](panduan/fitur-tambah-produk.jpg)

![Daftar status produk](panduan/fitur-produk-saya.jpg)

![Produk ditolak beserta alasannya](panduan/fitur-produk-ditolak.jpg)

- **Ulasan Produk**: semua ulasan untuk produk penjual, diperbarui langsung; ulasan palsu atau kasar dapat **dilaporkan** satu kali, dengan alasan.

![Ulasan Produk: ulasan dan tombol lapor](panduan/fitur-tenant-ulasan.jpg)

- **Kalkulator Profit & Iklan**: margin, break-even ROAS, biaya iklan per penjualan tertinggi yang masih aman, serta profit bersih per unit dan per bulan. Tidak ada yang disimpan.

![Kalkulator Profit & Iklan](panduan/fitur-tenant-kalkulator.jpg)

- **Notifikasi** (langsung, dengan tanda belum dibaca), **Bantuan & Ketentuan**, dan **Pengaturan Akun** (nama, telepon, foto, password). Foto akun harus menampilkan wajah pemiliknya; gambar lain ditolak saat diunggah.

![Notifikasi](panduan/fitur-notifikasi.jpg)

![Pengaturan akun](panduan/fitur-pengaturan-akun.jpg)

### Admin

- **Dashboard**: jumlah penjual dan produk menurut status untuk periode yang dipilih, serta produk yang menunggu konfirmasi.

![Dashboard admin](panduan/fitur-admin-dashboard.jpg)

- **Konfirmasi Produk**: menyetujui, menolak (dengan alasan), atau menurunkan produk. Penjual diberi tahu setiap kali.

![Konfirmasi Produk](panduan/fitur-admin-konfirmasi.jpg)

![Detail produk sebelum memutuskan](panduan/fitur-admin-konfirmasi-detail.jpg)

- **Kategori Produk**: tambah, ubah nama, hapus; setiap kategori memerlukan gambar (tampil di carousel Beranda).

![Kategori Produk](panduan/fitur-admin-kategori.jpg)

- **Manajemen UMKM**: mengaktifkan atau menonaktifkan akun penjual, dan membaca profil tokonya.

![Manajemen UMKM](panduan/fitur-admin-umkm.jpg)

- **Laporan Ulasan**: ulasan yang dilaporkan penjual; **sembunyikan** (tidak lagi tampil atau dihitung dalam rating), **tetap tampilkan**, atau tampilkan kembali yang disembunyikan.

![Laporan Ulasan](panduan/fitur-admin-ulasan.jpg)

- **Manajemen Produk** (semua produk menurut status dan kategori), **Notifikasi**, **Pengaturan**.

### Disnakertrans

- **Aktivasi akun lewat email**: superadmin tidak menentukan password. Petugas baru menerima kata sandi sementara dan sebuah tombol; di halaman aktivasi ia memasukkannya lalu membuat password sendiri.

![Halaman aktivasi akun Disnakertrans](panduan/fitur-aktivasi-akun.jpg)

- **Aktivasi Admin**: mengaktifkan atau menonaktifkan akun admin. Admin yang baru diaktifkan menerima email.

![Aktivasi Admin](panduan/fitur-disnakertrans-admin.jpg)

- **Konfirmasi Produk**, **Laporan Ulasan**, **Kategori Produk**: sama seperti admin. **Data Produk** dan **Data UMKM** untuk dibaca.

### Superadmin

- **Dashboard**: jumlah total setiap jenis akun dan produk menurut status.

![Dashboard superadmin](panduan/fitur-superadmin-dashboard.jpg)

- **Akun Disnakertrans**: membuat akun (nama, telepon, email; tanpa password) dan mengirim ulang email aktivasi.

![Menambah akun Disnakertrans](panduan/superadmin-1-tambah.jpg)

- **Semua Pengguna**, **Data Produk**, **Data UMKM**, **Kategori Produk**: hanya baca.

![Semua Pengguna](panduan/fitur-superadmin-pengguna.jpg)

- **Log API**: setiap pembuatan, perubahan, dan penghapusan oleh pengguna yang login serta setiap percobaan login, beserta hasilnya, grafik permintaan per hari, dan galat yang paling sering. Password dan token tidak pernah dicatat.

![Log API](panduan/fitur-superadmin-log.jpg)

- **Monitor Server**: CPU, RAM, dan disk server secara langsung (pembacaan baru setiap 3 detik selama halaman terbuka, dengan grafik 5 menit terakhir), apakah backend, website, halaman pemeliharaan, PostgreSQL, dan nginx berjalan, serta berapa besar database, foto, dan cadangan. Tidak ada yang disimpan.

![Monitor Server](panduan/fitur-superadmin-monitor.jpg)

- **Panduan Server**: panduan ini, dalam bahasa Inggris dan Bahasa Indonesia, tema terang atau gelap.

### Di balik layar

| fitur | yang dilakukan | tempatnya |
|---|---|---|
| Email | OTP pendaftaran, aktivasi Disnakertrans, atur ulang kata sandi, "akun admin Anda sudah aktif", cadangan mingguan. Semuanya dalam Bahasa Indonesia | `src/mail/templates.ts`, `SMTP_*` di `.env` backend |
| Notifikasi langsung | Notifikasi, daftar ulasan, dan tanda belum dibaca diperbarui tanpa memuat ulang (Socket.IO) | `src/realtime/socket.ts` |
| Perlindungan login | 5 password salah untuk satu akun dari satu jaringan, atau 20 dari satu jaringan untuk akun mana pun, dalam 15 menit: jaringan itu harus menunggu (429). Dihitung di memori backend, jadi restart menghapusnya | `src/services/loginGuard.service.ts` |
| Sesi | Login berakhir setelah **1 jam tanpa aktivitas**: selama pengguna mengeklik atau mengetik, website memperpanjangnya (paling sering sekali semenit), sampai **12 jam** setelah login. Logout, penonaktifan, atau atur ulang kata sandi langsung mengakhiri sesi | `src/services/auth.service.ts` (`refreshSession`), frontend `src/lib/auth.tsx` |
| Pemeriksaan foto akun | Foto akun yang baru harus menampilkan wajah. Pendeteksi wajah di server memeriksanya saat diunggah (sekitar setengah detik) dan sekali lagi saat disimpan; logo, produk, atau pemandangan ditolak. Tidak ada data wajah yang disimpan. Pemeriksaan pertama setelah restart memuat pendeteksi, yang menambah sekitar 300 MB memori backend | `src/services/faceDetection.service.ts` |
| Unggah foto | Foto terunggah saat dipilih dan ditautkan saat *Simpan*; yang tidak terpakai dihapus setiap malam | bagian 7 dan 12 |
| Perlindungan ulasan | Pemeriksaan "bukan robot", satu ulasan per produk per hari, maksimal 5 ulasan dalam 10 menit per jaringan, pelaporan dan penyembunyian. Alamat IP pengunjung hanya disimpan sebagai hash | `src/services/review.service.ts` |
| Cadangan mingguan | Database dan foto, disimpan di server dan dikirim lewat email | bagian 7 |
| Peringatan disk | Setiap 10 menit backend memeriksa disk; pada `DISK_ALERT_PERCENT` (90) atau lebih, backend mengirim email ke kotak surat situs berisi apa yang memakai ruang dan apa yang dapat dikosongkan, paling sering sekali sehari | `src/services/serverMonitor.service.ts` |
| Mesin pencari (SEO) | Judul, deskripsi, sitemap, data terstruktur, `http` ke `https` | README frontend, *SEO* |
| Halaman pemeliharaan | Tampil menggantikan website saat pembaruan, dalam dua bahasa | bagian 5 |
| Dokumentasi API publik | `/docs` pada domain API, dalam bahasa Inggris dan Bahasa Indonesia, dengan diagram alur | `npm run docs` |

## 15. Memperbarui Panduan (halaman bantuan)

**Panduan** adalah bantuan milik website: `/panduan` untuk semua orang (tautan di header dan footer) dan **Bantuan & Ketentuan** di dashboard penjual (tenant). Keduanya menampilkan daftar topik yang sama; setiap topik dapat dibuka untuk melihat teks dan tangkapan layar langkah demi langkah. Semuanya ada di kode **frontend**; backend tidak terlibat.

### Lokasi berkas

Semua lokasi berada di dalam `/home/prafi/project/prafi-frontend`.

| berkas | fungsi |
|---|---|
| `src/lib/guides.tsx` | **Isinya.** Daftar `GUIDES`: setiap topik dengan judul, ikon, siapa yang melihatnya, dan teksnya. Inilah berkas yang Anda ubah |
| `public/panduan/*.jpg` | Tangkapan layar yang dipakai langkah-langkah (JPG 1024×640) |
| `src/components/GuideSteps.tsx` | `Steps` dan `Step`: langkah bernomor, masing-masing dengan tangkapan layar opsional (klik untuk memperbesarnya di popup) |
| `src/components/GuideList.tsx` | Menggambar daftar topik (setiap topik adalah kotak yang dapat dibuka) |
| `src/app/(public)/panduan/page.tsx` | Halaman publik `/panduan`: menampilkan topik yang `audience`-nya memuat `"public"` |
| `src/app/tenant/bantuan/page.tsx` | Halaman penjual `/tenant/bantuan`: menampilkan topik yang `audience`-nya memuat `"tenant"` |
| `docs/PANDUAN-PENGGUNA.md` | Panduan yang sama dalam bentuk dokumen (untuk dicetak / dibagikan). Tidak tampil di website: perbarui manual saat sebuah topik berubah |
| `prafi-backend/docs/SERVER-GUIDE.md` dan `.id.md`, bagian 14 | Daftar fitur di panduan ini memiliki tangkapan layar sendiri di folder yang sama (`fitur-*.jpg`): tambahkan satu baris dan satu gambar di sana saat ada fitur baru |

### Cara sebuah topik ditulis

Setiap entri di `GUIDES` (di `src/lib/guides.tsx`) memiliki field berikut:

| field | arti |
|---|---|
| `id` | Nama pendek dengan tanda hubung, unik. Juga menjadi tautan topik: `/panduan#<id>` (mis. halaman login menautkan ke `/panduan#ketentuan`) |
| `title` | Judul topik (Bahasa Indonesia) |
| `summary` | Satu baris di bawah judul |
| `icon` | Ikon dari `src/components/Icons.tsx` (mis. `IconPlus`, `IconStore`); import di bagian atas berkas |
| `color` | Warna ikon, mis. `"#0e3c69"` (navy) atau `"#ea7b25"` (oranye) |
| `audience` | Tempat tampilnya: `"public"` = `/panduan`, `"tenant"` = dashboard penjual. `"admin"` diterima tetapi belum ada halaman yang menampilkannya |
| `body` | Isinya: langkah-langkah (`<Steps>` / `<Step>`), atau teks biasa (`<p>`, `<ul><li>`) |

Di dalam teks, `<b>…</b>` menebalkan kata (gunakan untuk nama tombol dan menu, seperti pada topik lain) dan `<Link href="/register">…</Link>` menautkan ke halaman website. Topik tampil sesuai urutan di daftar.

Langkah dengan tangkapan layar:

```tsx
<Step image="produk-2-foto" alt="Kotak unggah foto produk">
  Klik kotak <b>UNGGAH FOTO PRODUK</b> lalu <b>PILIH FILE</b>.
</Step>
```

`image` adalah nama berkas di `public/panduan/` **tanpa** `.jpg`; `alt` menjelaskan gambar untuk pembaca layar. Hilangkan `image` untuk langkah tanpa gambar.

### Contoh 1: menambah topik baru

Topik baru *Cara Memberi Ulasan* untuk pengunjung dan penjual. Topik ini memakai ikon jempol `IconThumb` (ikon apa pun yang diekspor `src/components/Icons.tsx` dapat dipakai): tambahkan ke daftar `import { … } from "@/components/Icons"` di bagian atas `src/lib/guides.tsx`. Lalu tambahkan sebuah entri ke `GUIDES`, di antara dua entri `{ … },` yang ada, di tempat topik itu seharusnya muncul:

```tsx
  {
    id: "beri-ulasan",
    title: "Cara Memberi Ulasan",
    summary: "Memberi bintang dan ulasan pada produk",
    icon: IconThumb,
    color: "#ea7b25",
    audience: ["public", "tenant"],
    body: (
      <Steps>
        <Step image="ulasan-1-form" alt="Form ulasan di halaman produk">
          Buka halaman produk, gulir ke bagian <b>ULASAN PEMBELI</b>, lalu di <b>Tulis Ulasan</b> pilih jumlah bintang (1 – 5).
        </Step>
        <Step>
          Isi nama dan ulasan Anda, lalu klik <b>Kirim Ulasan</b>. Tidak perlu login.
        </Step>
      </Steps>
    ),
  },
```

Letakkan tangkapan layarnya di `public/panduan/ulasan-1-form.jpg` (bagian di bawah). Topik itu kemudian ada di `/panduan#beri-ulasan`.

### Contoh 2: mengubah topik yang ada

Cari `id` topik di `src/lib/guides.tsx` (mis. `id: "tambah-produk"`) lalu ubah teksnya, atau tambahkan `<Step>` di antara dua langkah yang ada. Misalnya, untuk memberi tahu penjual tentang kualitas foto di *Panduan Menambahkan Produk*, tambahkan setelah langkah foto:

```tsx
        <Step>
          Gunakan foto yang terang dan jelas, dengan latar polos. Lihat juga topik <b>Ketentuan Foto / Deskripsi</b>.
        </Step>
```

Nomor langkah ditambahkan otomatis. Untuk topik tanpa langkah (seperti *Kebijakan Privasi*), tambahkan atau ubah baris `<li>…</li>` di dalam `<ul>`-nya.

### Tangkapan layar

- Ambil tangkapan layar dari website yang sebenarnya (dengan data contoh, bukan pelanggan asli), dan beri garis **merah** pada bagian yang dibahas langkah tersebut, seperti pada gambar yang sudah ada.
- Simpan sebagai **JPG, 1024×640** piksel (halaman menyediakan ruang sebesar itu), di bawah sekitar 200 KB.
- Beri nama `<topik>-<nomor>-<apa>.jpg` (mis. `ulasan-1-form.jpg`) dan letakkan di `public/panduan/`. Gambar yang hanya dipakai panduan server ini diberi nama `fitur-<apa>.jpg`.
- Untuk mengganti gambar, timpa berkas dengan nama yang sama: tidak perlu mengubah kode.

### Menerbitkan perubahan

Panduan adalah bagian dari build frontend, jadi perubahan baru terlihat setelah build ulang. Kerjakan lewat git seperti perubahan lainnya (bagian 5):

```bash
cd /home/prafi/project/prafi-frontend
npm run lint                  # menangkap import yang hilang atau salah ketik pada tag
npm run build                 # kesalahan di guides.tsx berhenti di sini; situs yang berjalan tidak tersentuh
sudo systemctl restart prafi-frontend
```

Lalu periksa `/panduan` (dan **Bantuan & Ketentuan** sebagai penjual). Kesalahan yang sering terjadi: tag dibuka tetapi tidak ditutup (`<b>` tanpa `</b>`), `,` yang hilang setelah `},`, ikon dipakai tetapi tidak di-import, atau nama `image` yang tidak cocok dengan berkasnya (langkah itu akan menampilkan gambar rusak).

## 16. Mengatasi masalah

| masalah | pemeriksaan / perbaikan |
|---|---|
| Website menampilkan 502 Bad Gateway | Frontend mati: `systemctl status prafi-frontend`, lalu `journalctl -u prafi-frontend -n 50` |
| Website terbuka tetapi datanya tidak (daftar kosong, galat) | Backend mati atau bermasalah: `curl https://api.transniaga.manokwarikab.go.id/api/health`, lalu `journalctl -u prafi-backend -n 50` |
| Sebuah service terus restart (`code=exited`) | Baca lognya. Penyebab umum: versi Node yang salah (Next.js 16 di Node 18), pengaturan `.env` yang hilang (`Missing required environment variable`), build yang belum dijalankan (`dist/` atau `.next/` tidak ada) |
| Log backend: galat koneksi database | `systemctl status postgresql`; periksa `DB_*` di `.env` |
| Log backend: `column ... does not exist` | Ada migrasi yang belum dijalankan (bagian 7) |
| Seseorang tidak bisa login: "Terlalu banyak percobaan login yang gagal" | Terlalu banyak password salah dari jaringannya. Berakhir sendiri setelah 15 menit; *Lupa Password* tetap bisa dipakai. Untuk menghapus semua waktu tunggu sekaligus: `sudo systemctl restart prafi-backend` |
| Foto wajah asli ditolak sebagai foto akun ("Wajah tidak terlihat pada foto") | Pendeteksi memerlukan wajah yang cukup jelas: minta foto yang menghadap kamera dengan cahaya cukup. Bila foto yang jelas pun ditolak, turunkan `MIN_SCORE` di `src/services/faceDetection.service.ts` (lalu build dan restart). Bila log menampilkan `[face] detection could not run`, pendeteksinya rusak (jalankan `npm install` di backend) dan sementara itu foto diterima tanpa diperiksa |
| Email masuk ke folder **Spam** penerima | Situs mengirim lewat akun Gmail gratis, yang kurang dipercaya penyedia email untuk surat otomatis; emailnya dibuat sederhana untuk membantu (tanpa web font, tanpa tautan promosi). Minta penerima menandainya *Bukan spam*. Perbaikan yang tahan lama adalah mengirim dari domain situs sendiri melalui layanan email, dengan record SPF, DKIM, dan DMARC yang dipasang oleh pengelola `manokwarikab.go.id`, lalu ubah `SMTP_*` dan `MAIL_FROM` di `.env` backend |
| Email tidak sampai | Log backend menampilkan galat emailnya; periksa `SMTP_*` (app password Gmail masih berlaku?) |
| Halaman publik menampilkan data lama | Halaman di-cache hingga 60 detik; periksa `REVALIDATE_SECRET` sama di kedua berkas `.env` |
| Disk penuh, atau email *Peringatan: disk server … terisi …%* datang | Lihat apa yang memakai ruang di **Monitor Server** pada dashboard, atau `df -h`. Hapus log lama (`sudo journalctl --vacuum-time=14d`), cadangan manual lama di folder home, atau kurangi cadangan mingguan yang disimpan (`BACKUP_KEEP`). Ukuran tiap folder utama: `sudo du -xh / --max-depth=1` |
| Sertifikat HTTPS kedaluwarsa | `sudo certbot renew` dan periksa keluarannya |

## 17. Hal yang perlu ditingkatkan

- **Gunakan user database terpisah** untuk aplikasi, bukan superuser `postgres`.
- **Batasi Webmin** (port 10000 dan 20000 terbuka ke internet): izinkan hanya IP yang dikenal, atau tutup dan gunakan `core.transniaga…` saja.
- **Masukkan folder `deploy/` backend ke git**, agar berkas service dan nginx tidak hilang bersama server.
- **Matikan versi TLS lama**: `ssl_protocols` di `/etc/nginx/nginx.conf` masih mengizinkan TLS 1.0 dan 1.1; `TLSv1.2 TLSv1.3` sudah cukup untuk semua browser saat ini.
