Bahasa Indonesia untuk dokumentasi API (npm run docs).
Setiap bagian dicocokkan dengan nama folder / request di koleksi Postman:
  === OVERVIEW
  === FOLDER <nama folder di Postman> => <judul Indonesia>
  === REQ <nama request di Postman> => <judul Indonesia>
Baris "**Access:**" tidak perlu ditulis (diambil dari nama request). Bagian yang belum diterjemahkan tampil dalam bahasa Inggris dan dilaporkan saat generate.

=== OVERVIEW
Backend API untuk Prafi (Express + Sequelize + PostgreSQL), dengan notifikasi realtime melalui Socket.IO dan email (nodemailer).

## Persiapan (sekali saja)
1. Import koleksi ini dan `Prafi-Local.postman_environment.json`, lalu pilih **Prafi Local** (dropdown environment, kanan atas).
2. Di **Prafi Local**, isi `loginEmail` / `loginPassword` (kolom Current value) dengan akun superadmin dari `.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`), lalu Ctrl+S.
3. Jalankan server (`npm run dev` atau `npm run build && npm start`). `baseUrl` adalah `http://localhost:4000`.
4. Email: isi `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` di `.env` agar email benar-benar terkirim. Isi `FRONTEND_URL` dengan alamat frontend: email lupa kata sandi berisi link ke `<FRONTEND_URL>/reset-password` dan email aktivasi disnakertrans ke `<FRONTEND_URL>/aktivasi`. Tanpa `SMTP_HOST` (development), email ditampilkan di log server dan OTP, atau token aktivasi beserta kata sandi sementara, dikembalikan di `meta.verification` serta disimpan sebagai `{{otp}}` / `{{verifyToken}}` / `{{temporaryPassword}}`.

## Login dan role
- Setiap request memakai **Bearer `{{token}}`** (diatur di koleksi; request mewarisinya). Request publik memakai *No Auth*.
- **Auth → Login** menyimpan token ke `{{token}}` (berlaku **1 jam**, diperpanjang selama Anda aktif: *Perpanjang Sesi*). Untuk berganti role, ubah `loginEmail` / `loginPassword` (atau body Login) lalu kirim Login lagi.
- **Nama setiap request menunjukkan siapa yang boleh memanggilnya**: `(All roles)` = superadmin, disnakertrans, admin, dan tenant; `(superadmin, disnakertrans, admin)`, `(admin)`, `(tenant)`… = hanya role tersebut; `(Public)` = tanpa login. Role lain mendapat **403**.
- Setiap akun harus memiliki **email terverifikasi** (`mailActive: true`) dan **approval aktif** (`approval.isActive: true`) untuk login dan memakai API.

| role | dibuat oleh | verifikasi email | approval awal | dapat |
|---|---|---|---|---|
| superadmin | seed (`npm run db:seed`) | sudah terverifikasi | aktif | membuat, menonaktifkan, dan mengaktifkan kembali akun disnakertrans; **hanya membaca** data lainnya (user, produk, tenant, kategori produk); menerima notifikasi setiap akun dan produk baru |
| disnakertrans | superadmin (*Register Disnakertrans*) | kata sandi sementara + link aktivasi lewat email (24 jam), diganti dengan kata sandi sendiri | aktif | melihat serta mengaktifkan/menonaktifkan akun **admin** dan **produk**, melihat semua produk dan tenant, mengelola kategori produk |
| admin | daftar sendiri (*Register Admin*) | OTP (15 menit) | **tidak aktif** sampai diaktifkan disnakertrans | mengaktifkan akun tenant **dan produk**, membaca user (tenant)/produk/tenant, mengelola kategori produk |
| tenant | daftar sendiri (*Register Tenant*) | OTP (15 menit) | aktif | mengelola produk dan profil tenant miliknya sendiri |

## Endpoint
| folder | endpoint | akses |
|---|---|---|
| Health | `GET /api/health` | Publik |
| Auth | `POST /api/auth/login` | Publik |
| Auth | `POST /api/auth/logout` | Semua role |
| Auth | `POST /api/auth/refresh` | Semua role |
| Auth | `POST /api/auth/register/disnakertrans` | superadmin |
| Auth | `POST /api/auth/register/admin` | Publik |
| Auth | `POST /api/auth/register/tenant` | Publik |
| Auth | `POST /api/auth/verify-otp/{{userId}}` | Publik |
| Auth | `POST /api/auth/activate/check` | Publik |
| Auth | `POST /api/auth/activate` | Publik |
| Auth | `POST /api/auth/confirm-email` | Publik |
| Auth | `POST /api/auth/resend-verification/{{userId}}` | Publik |
| Auth | `POST /api/auth/forgot-password` | Publik |
| Auth | `POST /api/auth/reset-password/check` | Publik |
| Auth | `POST /api/auth/reset-password` | Publik |
| Auth | `GET /api/auth/me` | Semua role |
| Auth | `PATCH /api/auth/me` | Semua role |
| Gambar | `POST /api/images` | Semua role |
| Gambar | `GET {{imagePath}}` | Publik |
| Gambar | `DELETE /api/images/{{imageId}}` | tenant |
| Pengguna | `GET /api/users` | superadmin, disnakertrans, admin |
| Pengguna | `PATCH /api/users/{{userId}}/email` | admin |
| Persetujuan | `PATCH /api/approvals/{{userId}}` | disnakertrans, admin |
| Persetujuan | `PATCH /api/approvals/{{productId}}` | disnakertrans, admin |
| Produk | `GET /api/products` | Semua role |
| Produk | `GET /api/products/{{productId}}` | Semua role |
| Produk | `POST /api/products` | tenant |
| Produk | `PATCH /api/products/{{productId}}` | tenant |
| Produk | `DELETE /api/products/{{productId}}` | tenant |
| Landing | `GET /api/landing/site` | Publik |
| Landing | `GET /api/landing/guides` | Publik |
| Landing | `GET /api/landing/categories` | Publik |
| Landing | `GET /api/landing/products` | Publik |
| Landing | `GET /api/landing/products/{{productId}}` | Publik |
| Landing | `GET /api/landing/products/{{productId}}/reviews` | Publik |
| Landing | `POST /api/landing/products/{{productId}}/reviews` | Publik |
| Landing | `GET /api/landing/tenants` | Publik |
| Landing | `GET /api/landing/tenants/{{tenantProfileId}}` | Publik |
| Konten Situs | `GET /api/site-content` | disnakertrans, admin |
| Konten Situs | `PATCH /api/site-content` | disnakertrans, admin |
| Panduan | `GET /api/guides` | superadmin, disnakertrans, admin |
| Panduan | `POST /api/guides` | superadmin, disnakertrans, admin |
| Panduan | `PATCH /api/guides/{{guideSectionId}}` | superadmin, disnakertrans, admin |
| Panduan | `PATCH /api/guides/order` | superadmin, disnakertrans, admin |
| Panduan | `DELETE /api/guides/{{guideSectionId}}` | superadmin, disnakertrans, admin |
| Panduan | `POST /api/guides/{{guideSectionId}}/steps` | superadmin, disnakertrans, admin |
| Panduan | `PATCH /api/guides/{{guideSectionId}}/steps/{{guideStepId}}` | superadmin, disnakertrans, admin |
| Panduan | `PATCH /api/guides/{{guideSectionId}}/steps/order` | superadmin, disnakertrans, admin |
| Panduan | `DELETE /api/guides/{{guideSectionId}}/steps/{{guideStepId}}` | superadmin, disnakertrans, admin |
| Ulasan | `GET /api/reviews/mine` | tenant |
| Ulasan | `POST /api/reviews/{{reviewId}}/report` | tenant |
| Ulasan | `GET /api/reviews` | disnakertrans, admin |
| Ulasan | `PATCH /api/reviews/{{reviewId}}/moderation` | disnakertrans, admin |
| Kategori Produk | `GET /api/product-categories` | Semua role |
| Kategori Produk | `GET /api/product-categories/{{categoryId}}` | Semua role |
| Kategori Produk | `POST /api/product-categories` | disnakertrans, admin |
| Kategori Produk | `PATCH /api/product-categories/{{categoryId}}` | disnakertrans, admin |
| Kategori Produk | `DELETE /api/product-categories/{{categoryId}}` | disnakertrans, admin |
| Tenant | `GET /api/tenants/me` | tenant |
| Tenant | `POST /api/tenants/me` | tenant |
| Tenant | `PATCH /api/tenants/me` | tenant |
| Tenant | `DELETE /api/tenants/me` | tenant |
| Tenant | `GET /api/tenants` | superadmin, disnakertrans, admin |
| Tenant | `GET /api/tenants/{{tenantProfileId}}` | superadmin, disnakertrans, admin |
| Notifikasi | `GET /api/notifications` | Semua role |
| Notifikasi | `GET /api/notifications/unread-count` | Semua role |
| Notifikasi | `PATCH /api/notifications/{{notificationId}}/read` | Semua role |
| Notifikasi | `PATCH /api/notifications/read-all` | Semua role |
| Notifikasi | `DELETE /api/notifications/{{notificationId}}` | Semua role |
| Statistik | `GET /api/stats/overview` | superadmin, disnakertrans, admin |
| Log | `GET /api/logs` | superadmin |
| Log | `GET /api/logs/stats` | superadmin |
| Log | `GET /api/logs/{{logId}}` | superadmin |
| Panduan Server | `GET /api/docs/server` | Publik (halaman; isi superadmin) |
| Panduan Server | `GET /api/docs/server/content` | superadmin |
| Monitor Server | `GET /api/server/metrics` | superadmin |
| Contoh | `GET /api/admin/ping` | superadmin, admin |
| Contoh | `GET /api/tenant/ping` | Semua role |
| Realtime (WebSocket) | Socket.IO di `{{baseUrl}}` | Semua role (Bearer token) |

## Variabel yang disimpan
Request menyimpan nilai yang dibutuhkan request berikutnya: `token`, `currentUserId`, `currentRole` (Login) · `userId`, `userRole`, `registeredEmail`, `otp` / `verifyToken` / `temporaryPassword` (Register, Resend) · `resetToken` (Forgot Password) · `imageId`, `imagePath` (Upload Image) · `productId` · `reviewId`, `reviewClientId` · `categoryId` · `tenantProfileId` · `guideSectionId`, `guideStepId` · `notificationId` · `logId`. Setiap penyimpanan dicetak di Postman Console.

## Contoh alur
1. **Login** sebagai superadmin → **Register Disnakertrans** (tanpa password: kata sandi sementara dikirim lewat email) → **Check Activation Link** → **Activate Account** (mengatur password menjadi `{{newUserPassword}}`; atau buka link dari email).
2. **Register Admin** → **Verify OTP** (kode dari email, atau `{{otp}}` saat development).
3. Isi `loginEmail` = email disnakertrans, `loginPassword` = `{{newUserPassword}}` → **Login** → **Activate / Deactivate User** dengan `userId` = id admin dan `userRole` = `admin`.
4. **Login** sebagai admin → **Upload Image** → **Create Product Category** (gambar untuk carousel beranda).
5. **Register Tenant** → **Verify OTP** → **Login** sebagai tenant → **Upload Image** → **Create My Tenant** → **Upload Image** lagi → **Create Product**.
6. **Login** sebagai admin → **List Notifications** → **Activate / Deactivate Product** → produk muncul di **Landing Products**.

## Respons
- Berhasil: `{ "success": true, "data": …, "meta"?: { page, limit, total, totalPages } | { verification } }`
- Gagal: `{ "success": false, "error": { "code", "message", "details"? } }`
- `message` dan `details[].message` berbahasa **Indonesia** (siap ditampilkan di frontend). `code` dan `field` tetap berbahasa Inggris; logika frontend sebaiknya memakai `code`.

| status | code (contoh) | arti |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST`, `ID_NOT_PROVIDED` | input tidak valid (`details` berisi daftar field) |
| 400 | `OTP_INVALID`, `OTP_EXPIRED`, `LINK_INVALID`, `LINK_EXPIRED`, `TEMPORARY_PASSWORD_INVALID`, `RESET_LINK_INVALID`, `RESET_LINK_EXPIRED` | kode / link verifikasi / link atur ulang kata sandi salah atau kedaluwarsa |
| 401 | `UNAUTHORIZED` | token tidak ada/tidak valid/kedaluwarsa/sudah logout, atau kata sandi telah diatur ulang → login lagi |
| 403 | `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `USER_NOT_ACTIVATED` | role tidak sesuai, email belum diverifikasi, atau akun belum diaktifkan |
| 404 | `NOT_FOUND` | tidak ditemukan, atau bukan milik Anda |
| 409 | `UNIQUE_CONSTRAINT`, `STILL_IN_USE`, `CONFLICT`, `EMAIL_ALREADY_VERIFIED` | nilai duplikat, data masih digunakan, sudah terverifikasi |
| 413 | `FILE_TOO_LARGE` | gambar lebih dari 9 MB |
| 429 | `TOO_MANY_REQUESTS` | kode verifikasi baru diminta kurang dari 60 detik yang lalu; terlalu banyak login gagal (5 per akun atau 20 per jaringan dalam 15 menit) |

## Notifikasi dan realtime
Setiap role menerima notifikasi untuk kejadian yang berkaitan dengannya (lihat **Notifikasi**); notifikasi aktivasi menyertakan `approval` beserta `userId` dan `user`. Notifikasi dikirim langsung melalui Socket.IO sebagai `notification:new` (lihat **Realtime (WebSocket)** untuk cara terhubung di Postman dan di frontend).

=== FOLDER Health => Health
Status server. Tidak perlu login.

=== REQ Health Check (Public) => Cek Status Server
Mengembalikan `{ status: "ok" }` saat API berjalan.

=== FOLDER Auth => Auth
Login, logout, pendaftaran, verifikasi email, lupa kata sandi, dan akun Anda sendiri (`/api/auth`).

**Login** menyimpan token ke `{{token}}`, yang dipakai semua request lain. Untuk bertindak sebagai role lain, ubah `loginEmail` / `loginPassword` (atau body) lalu kirim Login lagi.

| akun | didaftarkan oleh | verifikasi email | approval (`isActive`) |
|---|---|---|---|
| disnakertrans | superadmin (*Register Disnakertrans*, tanpa password) | **kata sandi sementara + link aktivasi** di email (berlaku 24 jam); pemilik menggantinya lewat *Aktifkan Akun* | langsung aktif |
| admin | sendiri (*Register Admin*, publik) | **OTP** 6 digit di email (berlaku 15 menit) | **tidak aktif** sampai diaktifkan disnakertrans |
| tenant | sendiri (*Register Tenant*, publik) | **OTP** 6 digit di email (berlaku 15 menit) | langsung aktif |

Setiap akun baru dimulai dengan `mailActive: false`: login dan semua endpoint yang memerlukan token menjawab **403 `EMAIL_NOT_VERIFIED`** sampai email diverifikasi. Email dikirim dalam Bahasa Indonesia.

**Development:** tanpa `SMTP_HOST` di `.env`, email tidak dikirim tetapi ditampilkan di log server, dan respons register/resend menyertakan `meta.verification.devCode` (OTP) atau `devLink` / `devToken` / `devTemporaryPassword` (disnakertrans), yang disimpan request sebagai `{{otp}}`, `{{verifyToken}}`, dan `{{temporaryPassword}}`.

**Aktivasi disnakertrans:** superadmin tidak menentukan password. *Daftarkan Disnakertrans* mengirim kata sandi sementara (8 karakter, mis. `Mangga47`) lewat email beserta tombol ke `<FRONTEND_URL>/aktivasi?userId=…&token=…`. Halaman tersebut memanggil *Cek Link Aktivasi*, lalu *Aktifkan Akun* dengan kata sandi sementara dan kata sandi baru. Kata sandi sementara saja tidak pernah bisa dipakai login.

**Lupa kata sandi:** *Lupa Kata Sandi* mengirim email berisi link ke halaman frontend `<FRONTEND_URL>/reset-password?userId=…&token=…` (berlaku 30 menit, sekali pakai). Halaman tersebut memanggil *Cek Link Atur Ulang*, lalu *Atur Ulang Kata Sandi* dengan kata sandi baru. Pengaturan ulang mengakhiri semua sesi yang ada.

=== REQ Login (Public) => Login
Masuk dan menyimpan access token sebagai `{{token}}` (berlaku 1 jam, diperpanjang selama Anda aktif: *Perpanjang Sesi*), serta `{{currentUserId}}` dan `{{currentRole}}`.

- superadmin: akun seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` di `.env`)
- disnakertrans / admin / tenant: akun yang dibuat dengan request Register (password `{{newUserPassword}}`; email disimpan sebagai `{{registeredEmail}}`)

**Batas percobaan:** hanya password salah yang dihitung. Setelah **5 kali salah untuk satu email dari satu jaringan (IP)**, atau **20 kali salah dari satu jaringan** untuk email mana pun, dalam 15 menit, jaringan itu mendapat 429 `TOO_MANY_REQUESTS` (`details.retryAfterSeconds`) sampai percobaan tertua berumur 15 menit, juga bila password-nya benar. Login yang berhasil menghapus hitungan akun tersebut. Jawaban 401 menyertakan `details.attemptsLeft`.

Error: 401 email/password salah (`details.attemptsLeft`), 429 terlalu banyak percobaan gagal, 403 `EMAIL_NOT_VERIFIED` (verifikasi email dulu; `details` berisi `userId` dan `method`: `otp`, `link`, atau `confirm` jika admin mengubah email dan tautan konfirmasi belum dibuka), 403 `USER_NOT_ACTIVATED` (akun belum diaktifkan). Lupa kata sandi? Gunakan *Lupa Kata Sandi*.

`data.user` adalah profil lengkap, sama seperti *Profil Saya* (`faceImage`, `approval`), sehingga foto dapat langsung ditampilkan setelah login.

=== REQ Logout (All roles) => Logout
Mencabut token yang dipakai untuk request ini (sesi lain tetap login) dan mengosongkan `{{token}}`. Koneksi WebSocket yang memakai token ini menerima `session:ended` (`logged_out`).

=== REQ Refresh Session (All roles) => Perpanjang Sesi
**Sesi geser (sliding session).** Menukar token saat ini yang masih berlaku dengan token yang berlaku satu jam lagi dari sekarang, dan menyimpannya sebagai `{{token}}`. Website memanggilnya sendiri selama pengguna aktif (klik, ketikan, sentuhan; paling sering sekali semenit), sehingga login baru berakhir setelah **1 jam tanpa aktivitas** (`JWT_EXPIRES_IN`).

Token baru termasuk sesi yang sama: satu *Logout* mengakhiri semua token sesi itu. Sesi dapat diperpanjang sampai **12 jam setelah login** (`SESSION_MAX_HOURS`); setelah itu endpoint ini menjawab 403 `SESSION_MAX_REACHED` dan token yang ada habis dengan sendirinya. `data.sessionEndsAt` adalah saat tersebut. Token yang digantikan tidak dibatalkan; ia habis sendiri dalam satu jam.

Koneksi Socket.IO yang terbuka diberi tahu lewat event `session:renew` (*Realtime*); kalau tidak, koneksi ditutup saat token lama habis. Tidak dicatat di log API.

Error: 401 tanpa token / token kedaluwarsa / sudah logout, 403 `SESSION_MAX_REACHED`.

=== REQ Register Disnakertrans (superadmin) => Daftarkan Disnakertrans
Membuat akun **disnakertrans** (pemberi persetujuan akun admin). **Tanpa `password` di body** (jika dikirim: 400): server membuat kata sandi sementara 8 karakter yang mudah dibaca (kata dan angka, mis. `Mangga47`) dan mengirimkannya ke email akun tersebut, dalam Bahasa Indonesia, beserta tombol ke halaman frontend `<FRONTEND_URL>/aktivasi?userId=…&token=…` (berlaku 24 jam). Di sana pemilik akun memasukkan kata sandi sementara dan membuat kata sandinya sendiri (*Cek Link Aktivasi*, *Aktifkan Akun*); baru setelah itu `mailActive` menjadi `true` dan akun bisa login. Kata sandi sementara tidak pernah diterima untuk login. Approval-nya langsung aktif (`approval.isActive: true`).

Memberi tahu setiap superadmin (`USER_REGISTERED`). Menyimpan `{{userId}}`, `{{userRole}}`, `{{registeredEmail}}`, dan saat development (tanpa `SMTP_HOST`) `{{verifyToken}}` serta `{{temporaryPassword}}` dari `meta.verification.devToken` / `devTemporaryPassword`.

=== REQ Register Admin (Public) => Daftar sebagai Admin
Pendaftaran publik untuk akun **admin**, tanpa token. Mengirim OTP 6 digit ke email (berlaku 15 menit); verifikasi dengan *Verifikasi OTP*. Setelah itu pun admin belum bisa login sampai diaktifkan oleh disnakertrans (*Persetujuan → Aktifkan / Nonaktifkan Pengguna*, `approval.isActive: false` sampai saat itu).

Memberi tahu setiap disnakertrans (`ADMIN_PENDING_ACTIVATION`) dan superadmin (`USER_REGISTERED`). Menyimpan `{{userId}}`, `{{userRole}}`, `{{registeredEmail}}`, dan saat development `{{otp}}`.

Respons: `data` = user baru (`mailActive: false`), `meta.verification` = `{ method: "otp", sentTo, expiresAt, emailSent }`.

=== REQ Register Tenant (Public) => Daftar sebagai Tenant
Pendaftaran publik, tanpa token. `tenantName` wajib diisi. Tenant **langsung aktif** setelah emailnya diverifikasi: OTP 6 digit dikirim ke email (berlaku 15 menit), verifikasi dengan *Verifikasi OTP*.

Memberi tahu setiap admin (`TENANT_REGISTERED`) dan superadmin (`USER_REGISTERED`). Menyimpan `{{userId}}`, `{{userRole}}`, `{{registeredEmail}}`, dan saat development `{{otp}}`.

=== REQ Verify OTP (Public) => Verifikasi OTP
Akun admin dan tenant: mengonfirmasi email dengan kode 6 digit dari email pendaftaran. `:userId` adalah id dari respons pendaftaran (atau dari error login 403 `EMAIL_NOT_VERIFIED`). Body: `{ "otp": "123456" }` (`OTP` juga diterima). Jika berhasil, `mailActive` menjadi `true` dan user bisa login.

Error: 400 `OTP_INVALID` (kode salah, `details.attemptsLeft`; setelah 5 kali salah perlu kode baru), 400 `OTP_EXPIRED` (lebih dari 15 menit), 409 `EMAIL_ALREADY_VERIFIED`, 404 user tidak ditemukan.

=== REQ Check Activation Link (Public) => Cek Link Aktivasi
Akun disnakertrans: apakah link aktivasi dari email masih bisa dipakai? Halaman frontend `/aktivasi` memanggilnya sebelum menampilkan form. Mengembalikan `email` akun dan `expiresAt` link.

Error: 400 `LINK_INVALID` (token salah, atau sudah diganti email aktivasi yang lebih baru), 400 `LINK_EXPIRED` (lebih dari 24 jam), 409 `EMAIL_ALREADY_VERIFIED` (akun sudah diaktifkan).

=== REQ Activate Account (Public) => Aktifkan Akun
Akun disnakertrans: mengganti **kata sandi sementara** dari email aktivasi dengan `password` milik sendiri (minimal 8 karakter, berbeda dari kata sandi sementara). Jika berhasil, `mailActive` menjadi `true` dan akun bisa login dengan kata sandi baru. `userId` dan `token` berasal dari link di email.

`temporaryPassword` yang salah menjawab 400 `TEMPORARY_PASSWORD_INVALID` dengan `details.attemptsLeft`; setelah 5 kali salah link diblokir dan perlu email aktivasi baru (*Kirim Ulang Verifikasi*, yang mengirim link **dan** kata sandi sementara baru).

Error lain: 400 validasi, 400 `LINK_INVALID`, 400 `LINK_EXPIRED`, 409 `EMAIL_ALREADY_VERIFIED`.

=== REQ Confirm Email (Public) => Konfirmasi Email
Penjual yang emailnya diubah admin (*Pengguna → Ubah Email Penjual*): tautan di email konfirmasi membuka halaman frontend `/konfirmasi-email`, yang memanggil endpoint ini dengan `userId` dan `token` dari tautan. Satu panggilan mengonfirmasi alamat baru (`mailActive: true`); penjual lalu login dengan email baru dan password yang sama.

Error: 400 `LINK_INVALID` (token salah, atau sudah diganti tautan yang lebih baru), 400 `LINK_EXPIRED` (lebih dari 24 jam: *Kirim Ulang Verifikasi* mengirim tautan baru), 409 `EMAIL_ALREADY_VERIFIED` (sudah dikonfirmasi).

=== REQ Resend Verification (Public) => Kirim Ulang Verifikasi
Mengirim OTP baru (admin, tenant), tautan konfirmasi baru (penjual yang emailnya diubah admin), atau untuk disnakertrans email aktivasi baru: link baru **dan kata sandi sementara baru** (yang lama hanya tersimpan sebagai hash, sehingga tidak bisa dikirim ulang). Kode, link, dan kata sandi sementara sebelumnya tidak berlaku lagi. Paling sering sekali per 60 detik (429 `TOO_MANY_REQUESTS`, `details.retryAfterSeconds`). Menyimpan `{{otp}}`, atau `{{verifyToken}}` dan `{{temporaryPassword}}`, yang baru saat development.

=== REQ Forgot Password (Public) => Lupa Kata Sandi
Mengirim email (Bahasa Indonesia) berisi link untuk mengatur ulang kata sandi, berlaku **30 menit** dan sekali pakai. Link membuka halaman **frontend** `<FRONTEND_URL>/reset-password?userId=…&token=…` (`FRONTEND_URL` di `.env`), yang memanggil *Cek Link Atur Ulang* dan *Atur Ulang Kata Sandi*.

Jawabannya selalu pesan 200 yang sama, baik email terdaftar maupun tidak, sehingga tidak bisa dipakai untuk mencari email yang terdaftar. Paling banyak satu email per akun setiap 60 detik (permintaan tambahan mendapat jawaban yang sama tetapi tidak mengirim apa pun).

**Development:** tanpa `SMTP_HOST`, email ditampilkan di log server dan `meta.devLink` dikembalikan; request ini menyimpan `userId` / `token`-nya sebagai `{{userId}}` / `{{resetToken}}`.

=== REQ Check Reset Link (Public) => Cek Link Atur Ulang
Untuk halaman atur ulang di frontend: apakah link dari email masih bisa dipakai? Menjawab `{ valid: true, email: "a*****i@gmail.com", expiresAt }` (email disamarkan, untuk menunjukkan akun mana yang kata sandinya diatur ulang).

Error: 400 `RESET_LINK_INVALID` (salah, sudah dipakai, atau diganti link yang lebih baru), 400 `RESET_LINK_EXPIRED` (lebih dari 30 menit).

=== REQ Reset Password (Public) => Atur Ulang Kata Sandi
Menyimpan kata sandi baru (minimal 8 karakter). Link hanya bisa dipakai sekali. Karena link datang lewat email, email juga dianggap terverifikasi (`mailActive: true`).

**Semua sesi diakhiri:** setiap token yang dibuat sebelum pengaturan ulang menjawab 401, dan koneksi WebSocket yang terbuka menerima `session:ended` dengan reason `password_reset`. Login lagi dengan kata sandi baru.

Error: 400 validasi (`password` kurang dari 8 karakter), 400 `RESET_LINK_INVALID`, 400 `RESET_LINK_EXPIRED`.

=== REQ Me (All roles) => Akun Saya
Akun yang sedang login beserta `faceImage`, `approval` akunnya, dan `mailActive`.

=== REQ Update Me (All roles) => Ubah Akun Saya
Mengubah akun Anda sendiri; kirim hanya field yang ingin diubah: `firstName`, `lastName`, `phoneNumber`, `email`, `faceImageId` (atau `null`), `tenantName` (khusus tenant), `password` + `currentPassword`. `faceImageId` yang baru harus berupa gambar yang menampilkan **wajah**: 400 `FACE_NOT_FOUND` (field `faceImageId`) bila tidak, juga bila gambarnya diunggah tanpa `?purpose=face`.

`id`, `role`, dan `mailActive` tidak pernah bisa diubah di sini. Jika `faceImageId` diganti (atau `null`), gambar lama beserta filenya dihapus.

=== FOLDER Images => Gambar
Unggah gambar (jpg, png, webp, gif; diterima hingga 9 MB, dan yang lebih dari **3 MB dikompres** menjadi 3 MB atau kurang sebelum disimpan: diperkecil hingga maksimal 2560 px dan disimpan dengan kualitas lebih rendah; PNG atau GIF besar menjadi WebP, sehingga `imgUrl` dapat berakhiran `.webp`). Unggah dulu, lalu pakai id yang dikembalikan sebagai `faceImageId`, `imageId` produk, atau `logoId` tenant. File dapat diakses publik di `imgUrl`. Jika gambar sebuah data diganti, gambar lama dan filenya otomatis dihapus.

Setiap kegagalan unggah memiliki pesan yang jelas dan `code` sendiri: `IMAGE_REQUIRED` (tanpa file), `EMPTY_IMAGE` (0 byte), `UNSUPPORTED_IMAGE_TYPE` (mis. `image/heic` dari iPhone), `INVALID_IMAGE_CONTENT` (isi file bukan gambar), `FILE_TOO_LARGE` (413, lebih dari 9 MB), `UPLOAD_INCOMPLETE` (koneksi terputus), `IMAGE_STORAGE_FAILED` / `IMAGE_SAVE_FAILED` (500, penyimpanan atau database server).

=== REQ Upload Image (All roles) => Unggah Gambar
multipart/form-data, field **image** (pilih file di Body → form-data). Menyimpan `{{imageId}}` dan `{{imagePath}}` (`imgUrl`; respons juga berisi link lengkap di `url`).

Satu gambar hanya bisa dipakai sekali: sebagai satu gambar produk, satu logo tenant, atau satu foto wajah.

**Foto akun:** tambahkan query `?purpose=face` bila gambar ini untuk foto profil akun (`faceImageId`). Server memeriksa bahwa gambar menampilkan **wajah** (pendeteksi wajah berjalan di server; tidak ada data wajah yang disimpan) dan menjawab 400 `FACE_NOT_FOUND` bila tidak, sehingga pengguna langsung tahu saat mengunggah. Pemeriksaan sekitar setengah detik.

=== REQ Open Image (Public) => Buka Gambar
Link publik gambar yang diunggah (`{{baseUrl}}` + `imgUrl`), seperti yang dimuat oleh frontend.

=== REQ Delete Image (tenant) => Hapus Gambar
Menghapus data dan file gambar. Gambar yang masih dipakai sebagai logo tenant tidak bisa dihapus (409 `STILL_IN_USE`).

=== FOLDER Users => Pengguna
Daftar akun. superadmin melihat semua akun, disnakertrans melihat akun admin, admin melihat akun tenant (dan dapat memperbaiki email penjual). Tenant hanya punya *Auth → Akun Saya*.

=== REQ List Users (superadmin, disnakertrans, admin) => Daftar Pengguna
superadmin: semua akun; disnakertrans: hanya akun admin; admin: hanya akun tenant. Filter: `role`, `q` (bagian dari nama, email, nomor telepon atau nama tenant, tanpa membedakan huruf besar/kecil, maksimal 100), `emailIssue=true` (hanya akun yang emailnya tidak sampai). Setiap user menyertakan `faceImage`, `approval`, `mailActive`, `tenant` (tenant: profil tokonya beserta `logo`; null jika belum dibuat) dan catatan pengiriman email:
- `emailIssue`: null, atau `not_found` (alamat tidak ada), `mailbox_full` (kotak masuk penuh), `rejected` (ditolak karena alasan lain), `delayed` (masih dicoba ulang), `send_failed` (server email kita gagal mengirim);
- `emailIssueDetail`: pesan asli dari server penerima; `emailIssueAt`: waktunya.

Ditemukan oleh pemeriksaan email gagal (backend membaca kotak masuk situs untuk balasan "tidak terkirim" setiap `BOUNCE_CHECK_MINUTES`); dihapus saat alamat diverifikasi atau diubah.

=== REQ Change Seller Email (admin) => Ubah Email Penjual
Memperbaiki email penjual (tenant). Body: `email`. Hanya akun tenant (selain itu 403); 409 `EMAIL_TAKEN` jika dipakai akun lain.

Penjual harus mengonfirmasi alamat baru: `mailActive` menjadi false (semua sesi penjual berakhir, koneksi WebSocket menerima `session:ended` dengan reason `email_changed`, dan login menjawab 403 `EMAIL_NOT_VERIFIED` dengan `details.method` = `confirm`), **tautan konfirmasi** (berlaku 24 jam) dikirim ke alamat baru: `<FRONTEND_URL>/konfirmasi-email?userId=…&token=…`. Membukanya langsung mengonfirmasi alamat (*Auth → Konfirmasi Email*); tidak ada kode atau kata sandi yang perlu diketik. *Kirim Ulang Verifikasi* mengirim tautan baru. Alamat lama menerima pemberitahuan perubahan. Catatan pengiriman email dihapus.

`data.verification.method` bernilai `confirm`; `emailSent` false = email gagal dikirim (penjual dapat meminta tautan baru saat login). Saat development token disimpan sebagai `{{verifyToken}}`.

=== FOLDER Approvals => Persetujuan
Mengaktifkan / menonaktifkan akun dan produk: `PATCH /api/approvals/:id?type=user|product`. `:id` adalah **id user** atau **id produk** (bukan id approval).

| type | siapa yang bisa | dampak |
|---|---|---|
| `user` | superadmin → akun disnakertrans; disnakertrans → akun admin; admin → akun tenant | akun yang tidak aktif tidak bisa login, dan langsung diputus dari realtime |
| `product` | disnakertrans, admin | produk aktif tampil di halaman landing |

Superadmin hanya dapat menonaktifkan / mengaktifkan kembali akun **disnakertrans** (yang dibuatnya langsung aktif); petugas tersebut menerima email beserta alasan (bila diisi). Selain itu superadmin hanya membaca. Setiap penonaktifan akun memberi tahu superadmin lain (`USER_DEACTIVATED`).

Setiap approval memiliki `type` (`user` = approval akun, `product` = approval produk) dan `userId` (pemilik akun, atau tenant pemilik produk).

=== REQ Activate / Deactivate User (superadmin, disnakertrans, admin) => Aktifkan / Nonaktifkan Pengguna
`isActive`: true/false. `role`: role akun yang dituju, sebagai konfirmasi (harus sesuai). `reason`: opsional.

disnakertrans mengaktifkan/menonaktifkan akun **admin**; admin mengaktifkan/menonaktifkan akun **tenant**. Memakai `{{userId}}` / `{{userRole}}` yang disimpan oleh request Register. Menonaktifkan akun mengakhiri sesi user tersebut (`session:ended`, reason `deactivated`) dan memberi tahu superadmin.

Saat disnakertrans **mengaktifkan akun admin** (dari tidak aktif menjadi aktif), admin tersebut menerima **email** (Bahasa Indonesia) bahwa akunnya sudah aktif, dengan tombol masuk ke website; `reason` yang diisi ikut ditampilkan sebagai catatan. Jika emailnya belum diverifikasi, email itu mengingatkan untuk menyelesaikan OTP dulu. Email dikirim di latar belakang: kegagalan pengiriman tidak menggagalkan aktivasi (dicatat di log server).

=== REQ Activate / Deactivate Product (disnakertrans, admin) => Aktifkan / Nonaktifkan Produk
Menyetujui produk (tampil di halaman landing) atau menurunkannya. Pemilik menerima `PRODUCT_APPROVED` saat produk tayang, atau `PRODUCT_TAKEN_DOWN` beserta `reason` saat ditolak atau dinonaktifkan (juga untuk produk baru yang ditolak, dan lagi untuk alasan baru); admin dan disnakertrans menerima `PRODUCT_PUBLISHED`; menurunkan produk yang sedang tayang memberi tahu superadmin. Mengirim status dan alasan yang sama lagi tidak mengirim notifikasi.

Respons menyertakan pemilik produk:
```json
{ "type": "product", "id": "…", "name": "…", "approval": { "type": "product", "userId": "…", "isActive": true, … },
  "user": { "firstName": "Budi", "lastName": "Santoso", …, "tenant": { … } | null, "productId": "…", "product": { … } } }
```

=== FOLDER Products => Produk
Tenant mengelola produknya sendiri; superadmin, disnakertrans, dan admin membaca semua produk. Produk baru awalnya **tidak aktif** dan menunggu admin atau disnakertrans (*Persetujuan → Aktifkan / Nonaktifkan Produk*).

`price` adalah harga dalam Rupiah (bilangan bulat; menggantikan `qty`). `categoryId` (wajib) adalah kategori produk yang dibuat admin (*Kategori Produk*); setiap produk membawa `category` (`id`, `name`). `isRecommended` **diatur otomatis oleh server**, bukan oleh tenant: `true` selama rata-rata ulasannya (1 desimal, seperti yang tampil) **4,8 bintang atau lebih**, dihitung ulang setiap ada ulasan baru. Produk rekomendasi tampil di rekomendasi halaman landing (`GET /api/landing/products?recommended=true`). Setiap produk memiliki `ratingAverage` (1 desimal, `null` jika belum ada ulasan) dan `reviewCount` dari ulasan publiknya.

=== REQ List Products (All roles) => Daftar Produk
superadmin/disnakertrans/admin: semua produk. tenant: hanya produk miliknya. Masing-masing dengan `category` (`id`, `name`). Filter opsional `isActive` (mis. `false` = menunggu persetujuan) dan `categoryId`.

=== REQ Get Product (All roles) => Detail Produk
Tenant mendapat 404 untuk produk yang bukan miliknya.

=== REQ Create Product (tenant) => Buat Produk
Profil tenant Anda harus **lengkap** terlebih dahulu (*Tenant → Buat Profil Tenant Saya*) dan akun Anda harus memiliki **foto profil** (`faceImageId`, *Auth → Ubah Profil Saya*); jika belum, 403 `TENANT_PROFILE_INCOMPLETE` dengan `details.missingFields` (mis. `["faceImageId"]`). Unggah gambarnya dulu (*Gambar → Unggah Gambar*); `imageId` wajib diisi. `categoryId` wajib: kategori produk (*Kategori Produk → Daftar*). `isRecommended` tidak boleh dikirim: server yang mengaturnya (lihat *Landing → Tulis Ulasan*). Menyimpan `{{productId}}`. Superadmin, admin, dan disnakertrans menerima `PRODUCT_SUBMITTED`, tenant menerima `PRODUCT_UNDER_REVIEW`. Jawaban berisi `slug`, bagian alamat produk yang mudah dibaca di website (`/produk/<slug>`), dibuat dari nama: bila sudah dipakai produk lain, sebuah angka ditambahkan (`brownis-prafi`, `brownis-prafi-1`, `brownis-prafi-2`, …). `slug` tidak dapat dikirim.

**Ketersediaan:** `isAvailable` opsional (bawaan `true` = "Tersedia"; `false` = "Stok Kosong"). Produk stok kosong disembunyikan dari semua halaman publik (daftar dan detail Landing menjawab seolah produk tidak ada, jumlah produk UMKM dan kategori tidak menghitungnya, ulasan baru ditolak).

=== REQ Update Product (tenant) => Ubah Produk
Hanya produk milik sendiri. Kirim salah satu dari `name`, `description`, `details`, `price`, `categoryId`, `imageId`, `isAvailable`. Aktivasi dan `isRecommended` tidak bisa diubah di sini. Admin dan disnakertrans menerima `PRODUCT_UPDATED`. Jika `imageId` diganti, gambar lama beserta filenya dihapus. Mengubah `name` membuat `slug` baru (diberi angka bila sudah dipakai); slug lama tetap mengarah ke produk yang sama.

**Ketersediaan:** `isAvailable` (`true` = "Tersedia", `false` = "Stok Kosong") hanya dapat diubah pemiliknya (route khusus tenant ini). Stok kosong menyembunyikan produk dari semua halaman publik sampai tersedia lagi. Saat berubah, semua superadmin, disnakertrans dan admin serta tenant menerima `PRODUCT_AVAILABILITY_CHANGED` (`name` "Product out of stock" / "Product available again"); `PRODUCT_UPDATED` hanya dikirim bila field lain ikut berubah.

=== REQ Delete Product (tenant) => Hapus Produk
Hanya produk milik sendiri. Approval, ulasan, dan gambarnya ikut dihapus. Admin dan disnakertrans menerima `PRODUCT_DELETED`.

=== FOLDER Landing => Landing
Halaman publik untuk pengunjung: tanpa token, tanpa data pribadi (tanpa email/telepon pemilik, tanpa alasan approval). Hanya produk yang **sudah disetujui** dan UMKM yang akun pemiliknya aktif yang ditampilkan.

**Ulasan** juga publik: siapa pun dapat membaca dan menulis ulasan tanpa login (`name`, `stars` 1–5, `review`), hanya untuk produk yang sudah disetujui. Maksimal 5 ulasan per pengunjung (IP) per 10 menit (429 `TOO_MANY_REQUESTS`). Produk memiliki `ratingAverage` (1 desimal, `null` jika belum ada ulasan) dan `reviewCount`; UMKM memiliki `productCount`, `ratingAverage`, dan `reviewCount` dari produknya yang sudah disetujui.

=== REQ Site Texts (Public) => Teks Situs
Teks yang diubah admin dan disnakertrans di *Konten Situs*: `footerAbout`, teks "tentang" di footer setiap halaman publik. Teks biasa: baris kosong memulai paragraf baru, `**teks**` ditebalkan (tampilkan sebagai teks, jangan sebagai HTML). Memakai teks bawaan sampai ada yang menyimpan teks.

=== REQ Landing Guides (Public) => Panduan Landing
Panduan (halaman bantuan) yang diubah di *Kelola Panduan*: setiap topik untuk `audience` (`public` = /panduan, bawaan; `tenant` = Bantuan & Ketentuan di dashboard penjual), sesuai urutan halaman, masing-masing dengan `steps` bernomor. Sebuah langkah memiliki `desktopImage` (layar lebar) dan `mobileImage` (HP; frontend berganti pada 640 px), masing-masing null bila belum diisi: bila hanya satu yang diisi, tampilkan di semua layar. `slug` adalah jangkar topik (`/panduan#<slug>`).

Teks (`intro`, `outro`, `body` langkah) berupa teks biasa: baris kosong memulai paragraf, baris yang diawali `- ` menjadi daftar, `**teks**` ditebalkan, `[label](/path)` menjadi tautan (halaman situs, `https://`, `mailto:` atau `tel:`), `{{kontak-admin}}` pada barisnya sendiri menampilkan WhatsApp dan email administrator, dan template tombol `{jenis: nilai | teks tombol}` dengan jenis `email`, `whatsapp` (bagian ke-3: pesan awal), `telepon`, `instagram`, `facebook`, `lokasi` atau `tombol` (halaman atau tautan https) menjadi tombol; yang tidak dapat dibaca tetap tampil sebagai teks biasa. Tampilkan sebagai teks, jangan sebagai HTML.

=== REQ Landing Categories (Public) => Kategori Landing
Semua kategori produk urut A→Z beserta `image` (null hanya untuk kategori lama yang belum diberi gambar) dan `productCount` (hanya produk yang sudah disetujui), untuk carousel beranda: setiap slide adalah gambar kategori, dan di sebelahnya *Produk Landing* dengan `categoryId` menampilkan produk kategori tersebut.

=== REQ Landing Products (Public) => Produk Landing
Hanya produk yang sudah disetujui, terbaru di atas, masing-masing dengan `category` (`id`, `name`). Filter opsional: `recommended=true` (produk dengan rata-rata ulasan **4,8 bintang atau lebih**, diatur server), `tenantId` (produk satu pemilik), `categoryId` (satu kategori, mis. slide carousel yang sedang tampil), dan `sort` (`newest` sebagai bawaan, atau `rating`: rata-rata tertinggi di atas, produk tanpa ulasan di bawah). `tenant.tenant` pada setiap produk adalah profil UMKM pemiliknya (`id`, `name`, dan tautan publiknya `whatsappLink`, `instagramLink`, `shopeeLink`, `googleBusinessLink`, `fbLink`, `gmapsLink`; yang kosong bernilai `null`) untuk *Detail UMKM Landing* dan tombol kontak di halaman produk.

=== REQ Landing Product (Public) => Detail Produk Landing
Satu produk yang sudah disetujui beserta `ratingAverage` / `reviewCount`. 404 untuk produk yang tidak ada atau belum disetujui. `{{productId}}` boleh berupa **slug** produk atau id-nya. Slug yang dimiliki produk sebelum namanya diubah tetap menemukannya; jawaban selalu berisi `slug` yang sekarang.

=== REQ List Reviews (Public) => Daftar Ulasan
Ulasan sebuah produk, terbaru di atas. `meta.ratingAverage` dan `meta.reviewCount` untuk ringkasan bintang.

=== REQ Create Review (Public) => Tulis Ulasan
Tanpa login. `name` (maks. 100), `stars` (bilangan bulat 1–5), `review` (**minimal 3 kata**, maks. 1000), `clientId` (id acak browser dari halaman, 8–64 huruf/angka/tanda hubung, disimpan di localStorage browser) dan `turnstileToken` (token Cloudflare Turnstile "Saya bukan robot" dari form; wajib bila server memiliki `TURNSTILE_SECRET_KEY`). Hanya untuk produk yang sudah disetujui. Mengembalikan ulasan beserta `meta.ratingAverage` / `meta.reviewCount` terbaru produk tersebut.

**Pengaman spam** (disimpan di database, sehingga restart tidak meresetnya):
- **browser yang sama di IP yang sama** hanya dapat mengulas satu produk **sekali per 24 jam** (429 `ALREADY_REVIEWED`, `details.retryAfterSeconds`);
- maksimal **5 ulasan per IP per 10 menit** (429 `TOO_MANY_REQUESTS`);
- Turnstile: 400 `TURNSTILE_REQUIRED` (tanpa token), 400 `TURNSTILE_FAILED` (tidak valid / kedaluwarsa), 503 `TURNSTILE_UNAVAILABLE`.

IP tidak pernah disimpan, hanya hash-nya; hash maupun `clientId` tidak pernah dikembalikan.

Setelah setiap ulasan, `isRecommended` produk dihitung ulang: `true` bila ada **minimal 3** ulasan yang tampil dan rata-ratanya (1 desimal, seperti yang tampil) **4,8 atau lebih**.

=== REQ Landing Tenants (Public) => Daftar UMKM Landing
UMKM (profil tenant) yang akun pemiliknya aktif, urut A→Z, masing-masing dengan logo, `productCount` (produk yang sudah disetujui), `ratingAverage`, dan `reviewCount`. Opsional `q` (cari nama). Menyimpan yang pertama sebagai `{{tenantProfileId}}`.

=== REQ Landing Tenant (Public) => Detail UMKM Landing
Satu UMKM beserta ringkasannya. Id boleh berupa id profil **atau id user pemiliknya** (`product.tenant.id`), sehingga halaman produk dapat langsung menautkan ke UMKM-nya. Produknya: *Produk Landing* dengan `tenantId` = `userId`. **Slug** UMKM juga dapat dipakai (`/umkm/<slug>` di website), begitu pula slug sebelum namanya diubah.

=== FOLDER Site Content => Konten Situs
Teks halaman publik yang diubah admin dan disnakertrans (menu dashboard *Konten Situs*). Pengunjung membacanya melalui *Landing → Teks Situs*.

=== REQ Get Site Content (disnakertrans, admin) => Lihat Konten Situs
Setiap teks yang dapat diubah dengan `value` saat ini, `default`, `maxLength`, `isDefault` (belum pernah disimpan) dan siapa yang terakhir menyimpan (`updatedAt`, `updatedBy`).

=== REQ Update Site Content (disnakertrans, admin) => Ubah Konten Situs
Body: `footerAbout` (maksimal 1500 karakter). Akhir baris dirapikan, spasi di ujung baris dihapus dan paling banyak satu baris kosong di antara paragraf. `""` atau `null` kembali ke teks bawaan. Halaman publik website langsung diperbarui.

=== FOLDER Guides => Panduan
Panduan (halaman bantuan) sebagai konten yang dapat diubah (menu dashboard *Kelola Panduan*): topik dengan langkah bernomor; setiap langkah dapat memiliki gambar desktop dan HP. Pengunjung membacanya melalui *Landing → Panduan Landing*. Gambar yang diganti, atau yang langkah maupun topiknya dihapus, juga dihapus dari disk.

=== REQ List Guides (superadmin, disnakertrans, admin) => Daftar Panduan
Semua topik (kedua audience) sesuai urutan halaman beserta langkah dan gambarnya, ditambah `editor` (yang terakhir mengubah). `meta.limits` berisi batas panjang teks.

=== REQ Create Guide Section (superadmin, disnakertrans, admin) => Tambah Topik Panduan
Topik baru, ditambahkan di akhir. `slug` dibuat sekali dari judul (ditambah angka bila sudah dipakai) dan tetap walaupun judul diganti, sehingga tautan `/panduan#<slug>` tetap berfungsi.

Field: `title` (wajib saat membuat, maksimal 120), `summary` (maksimal 255), `icon` (salah satu dari: search, user, users, store, plus, check, bell, camera, lock, settings, docs, headset, help, box, tag, message, calculator, home, heart, map), `color` (hex, mis. `#ea7b25`), `audience` (`public` = /panduan, `tenant` = Bantuan penjual; minimal satu), `intro` dan `outro` (maksimal 5000; `""` atau `null` menghapus).

Teks (`intro`, `outro`, `body` langkah) berupa teks biasa: baris kosong memulai paragraf, baris yang diawali `- ` menjadi daftar, `**teks**` ditebalkan, `[label](/path)` menjadi tautan (halaman situs, `https://`, `mailto:` atau `tel:`), `{{kontak-admin}}` pada barisnya sendiri menampilkan WhatsApp dan email administrator, dan template tombol `{jenis: nilai | teks tombol}` dengan jenis `email`, `whatsapp` (bagian ke-3: pesan awal), `telepon`, `instagram`, `facebook`, `lokasi` atau `tombol` (halaman atau tautan https) menjadi tombol; yang tidak dapat dibaca tetap tampil sebagai teks biasa. Tampilkan sebagai teks, jangan sebagai HTML.

Cache halaman publik website langsung diperbarui. Menyimpan `{{guideSectionId}}`.

=== REQ Update Guide Section (superadmin, disnakertrans, admin) => Ubah Topik Panduan
Kirim hanya field yang diubah. Field: `title` (wajib saat membuat, maksimal 120), `summary` (maksimal 255), `icon` (salah satu dari: search, user, users, store, plus, check, bell, camera, lock, settings, docs, headset, help, box, tag, message, calculator, home, heart, map), `color` (hex, mis. `#ea7b25`), `audience` (`public` = /panduan, `tenant` = Bantuan penjual; minimal satu), `intro` dan `outro` (maksimal 5000; `""` atau `null` menghapus).

=== REQ Reorder Guide Sections (superadmin, disnakertrans, admin) => Urutkan Topik Panduan
Body `ids`: **semua** id topik tepat satu kali, dalam urutan halaman yang baru (selain itu 400). Mengembalikan seluruh daftar.

=== REQ Delete Guide Section (superadmin, disnakertrans, admin) => Hapus Topik Panduan
Menghapus topik, langkah-langkahnya **dan gambarnya** (baris `images` dan berkas di disk).

=== REQ Add Guide Step (superadmin, disnakertrans, admin) => Tambah Langkah Panduan
Langkah baru di akhir topik. `body` (wajib, maksimal 3000), `imageAlt` (maksimal 255), `desktopImageId` dan `mobileImageId`: gambar yang diunggah dengan *Unggah Gambar* (desktop 16:10, mis. 1280×800; HP 9:16, mis. 720×1280), atau null. Gambar yang sudah dipakai di tempat lain (langkah lain, produk, logo…) ditolak (400), dan keduanya harus unggahan yang berbeda. Mengembalikan topik beserta langkahnya. Menyimpan `{{guideStepId}}`.

Teks (`intro`, `outro`, `body` langkah) berupa teks biasa: baris kosong memulai paragraf, baris yang diawali `- ` menjadi daftar, `**teks**` ditebalkan, `[label](/path)` menjadi tautan (halaman situs, `https://`, `mailto:` atau `tel:`), `{{kontak-admin}}` pada barisnya sendiri menampilkan WhatsApp dan email administrator, dan template tombol `{jenis: nilai | teks tombol}` dengan jenis `email`, `whatsapp` (bagian ke-3: pesan awal), `telepon`, `instagram`, `facebook`, `lokasi` atau `tombol` (halaman atau tautan https) menjadi tombol; yang tidak dapat dibaca tetap tampil sebagai teks biasa. Tampilkan sebagai teks, jangan sebagai HTML.

=== REQ Update Guide Step (superadmin, disnakertrans, admin) => Ubah Langkah Panduan
Kirim hanya field yang diubah. `desktopImageId` / `mobileImageId` yang baru mengganti gambar, `null` menghapusnya: gambar lama **dihapus** (baris `images` dan berkas di disk).

=== REQ Reorder Guide Steps (superadmin, disnakertrans, admin) => Urutkan Langkah Panduan
Body `ids`: semua id langkah topik tepat satu kali, dalam urutan baru (selain itu 400). Nomor langkah mengikuti urutan.

=== REQ Delete Guide Step (superadmin, disnakertrans, admin) => Hapus Langkah Panduan
Menghapus langkah **dan gambarnya** (baris dan berkas). Mengembalikan topik dengan langkah yang tersisa.

=== FOLDER Reviews => Ulasan
Menjaga ulasan produk (`/api/reviews`, Bearer `{{token}}`). Pengunjung menulis ulasan tanpa login (*Landing → Tulis Ulasan*); di sini **penjual melaporkan** ulasan pada produknya sendiri dan **admin / disnakertrans memutuskan**: `hide` (tidak lagi tampil dan tidak dihitung dalam rating maupun rekomendasi; datanya tetap tersimpan), `keep` (tetap tampil; penjual tidak dapat melaporkannya lagi) atau `unhide` (menampilkan kembali ulasan yang disembunyikan).

Setiap ulasan memiliki `isHidden`, `reportStatus` (`null` belum pernah dilaporkan, `pending`, `kept`, `hidden`), `reportReason`, `reportedAt`, `moderatedAt`, `moderationNote`. Laporan memberi tahu admin dan disnakertrans (`REVIEW_REPORTED`); keputusan memberi tahu penjual (`REVIEW_MODERATED`). Id browser dan hash IP pengunjung tidak pernah dikembalikan.

=== REQ My Product Reviews (tenant) => Ulasan Produk Saya
Ulasan pada produk milik sendiri, terbaru di atas, **termasuk yang disembunyikan** (agar penjual melihat keputusannya). `productId` opsional. Menyimpan yang pertama sebagai `{{reviewId}}`.

=== REQ Report Review (tenant) => Laporkan Ulasan
Hanya ulasan pada produk milik sendiri (lainnya: 404). `reason` (wajib, maks. 500). Ulasan tetap tampil sampai admin atau disnakertrans memutuskan. Sekali per ulasan: melapor lagi mendapat 409 (sedang menunggu, sudah dipertahankan, atau sudah disembunyikan).

=== REQ List Reported Reviews (disnakertrans, admin) => Daftar Ulasan Dilaporkan
`status`: `pending` (bawaan; laporan terlama di atas), `hidden`, `kept` atau `all`. Setiap ulasan beserta `product` (dan penjualnya), `reporter`, dan `moderator`.

=== REQ Moderate Review (disnakertrans, admin) => Putuskan Ulasan
`action`: `hide` (ulasan yang dilaporkan atau ulasan mana pun), `keep` (hanya laporan yang menunggu) atau `unhide` (ulasan yang disembunyikan); `note` opsional (maks. 500), ditampilkan kepada penjual. Menyembunyikan / menampilkan kembali langsung memperbarui rating dan rekomendasi produk serta halaman landing.

=== FOLDER Product Categories => Kategori Produk
Kategori produk (mis. Kuliner, Kerajinan). Dikelola oleh disnakertrans dan admin; semua role yang login dapat membacanya (superadmin dan tenant hanya membaca). Tenant memilih salah satunya untuk setiap produk (`categoryId`). Setiap kategori **wajib** memiliki gambar (`imageId`, unggah dulu melalui *Gambar → Unggah Gambar*): carousel halaman landing menampilkannya, dengan produk kategori tersebut di sebelahnya. Pengunjung membaca daftarnya melalui *Landing → Kategori Landing*. Setiap kategori membawa `productCount`.

=== REQ List Product Categories (All roles) => Daftar Kategori Produk
Diurutkan berdasarkan nama, masing-masing dengan `image` dan `productCount` (semua produknya, status apa pun).

=== REQ Get Product Category (All roles) => Detail Kategori Produk

=== REQ Create Product Category (disnakertrans, admin) => Buat Kategori Produk
Nama harus unik. `imageId` **wajib** (unggah gambarnya dulu; satu gambar per kategori): carousel di halaman landing menampilkannya. Menyimpan `{{categoryId}}`. **Tidak ada kategori ganda:** nama yang menghasilkan `slug` sama dengan kategori yang sudah ada (kata yang sama, apa pun huruf besar, spasi, atau tanda bacanya: "Kuliner", "kuliner", "Kuliner!") ditolak dengan 409 `CATEGORY_EXISTS`. Berbeda dengan produk, slug kategori tidak pernah diberi angka. Slug adalah alamat kategori di website (`/produk?kategori=<slug>`).

=== REQ Update Product Category (disnakertrans, admin) => Ubah Kategori Produk
Kirim `name` dan/atau `imageId`. `imageId` baru menggantikan gambar (gambar lama beserta filenya dihapus). Gambar tidak bisa dihapus (`imageId: null` → 400), hanya diganti. Kategori lama yang belum punya gambar sebaiknya segera diberi gambar. `name` baru ikut mengubah `slug`; nama yang sama dengan kategori lain ditolak dengan 409 `CATEGORY_EXISTS`.

=== REQ Delete Product Category (disnakertrans, admin) => Hapus Kategori Produk
Kategori yang masih dipakai produk tidak bisa dihapus (409 `STILL_IN_USE`, `details.productCount`): pindahkan dulu produknya ke kategori lain. Gambarnya (beserta file) ikut dihapus.

=== FOLDER Tenants => Tenant
Profil tenant (toko). User tenant mengelola profil **miliknya sendiri** di `/api/tenants/me`; superadmin, disnakertrans, dan admin membaca semua profil.

**Tautan:** semua tautan **opsional**: `whatsappLink`, `gmapsLink`, `fbLink`, `instagramLink`, `googleBusinessLink`, dan `shopeeLink`. Masing-masing berupa tautan `http(s)://`, atau `null` / `""` jika tidak ada (disimpan sebagai `null`; placeholder lama `"-"` juga diterima sebagai kosong). Panjang tautan maksimal 255 karakter, kecuali `googleBusinessLink` yang boleh sampai **2.048** karakter (tautan Google Bisnis sering sangat panjang). Tautan tidak pernah membuat profil dianggap belum lengkap.

=== REQ Get My Tenant (tenant) => Profil Tenant Saya
404 jika Anda belum membuat profil. `isComplete` / `missingFields`: produk baru dapat dibuat setelah semua field wajib terisi (tautan tidak dihitung: semuanya opsional). `missingFields` juga berisi `faceImageId` selama akun Anda belum memiliki foto profil..

=== REQ Create My Tenant (tenant) => Buat Profil Tenant Saya
Satu profil per tenant. Wajib: semua field kecuali `name` (bawaan: tenantName Anda) dan semua tautan (`whatsappLink`, `gmapsLink`, `fbLink`, `instagramLink`, `googleBusinessLink`, `shopeeLink`), yang opsional. `logoId`: unggah logo dulu. Profil tidak lagi memiliki kategori: setiap produk yang memilikinya (`categoryId`). Menyimpan `{{tenantProfileId}}`. Jawaban berisi `slug`, alamat UMKM di website (`/umkm/<slug>`), dibuat dari `name` dan diberi angka bila sudah dipakai (`dapur-mama`, `dapur-mama-1`). `slug` tidak dapat dikirim.

=== REQ Update My Tenant (tenant) => Ubah Profil Tenant Saya
Kirim hanya field yang ingin diubah. Kirim `null` (atau `""`) untuk menghapus sebuah tautan. Admin menerima `TENANT_PROFILE_UPDATED`. Jika `logoId` diganti, logo lama beserta filenya dihapus. Mengubah `name` membuat `slug` baru; slug lama tetap mengarah ke UMKM yang sama.

=== REQ Delete My Tenant (tenant) => Hapus Profil Tenant Saya
Menghapus profil tenant Anda (akun Anda tetap ada).

=== REQ List Tenants (superadmin, disnakertrans, admin) => Daftar Tenant
Semua profil tenant beserta pemilik dan logonya.

=== REQ Get Tenant (superadmin, disnakertrans, admin) => Detail Tenant

=== FOLDER Notifications => Notifikasi
Notifikasi untuk setiap role (`/api/notifications`, Bearer `{{token}}`). Notifikasi dibuat otomatis oleh aksi di folder lain.

| type | penerima | kapan |
|---|---|---|
| `USER_REGISTERED` | superadmin | setiap akun baru (disnakertrans, admin, tenant) |
| `ADMIN_PENDING_ACTIVATION` | disnakertrans | admin baru mendaftar (perlu diaktifkan) |
| `PRODUCT_SUBMITTED` | superadmin, admin, disnakertrans | tenant membuat produk |
| `USER_DEACTIVATED` | superadmin | disnakertrans atau admin menonaktifkan akun user |
| `PRODUCT_DEACTIVATED` | superadmin | admin atau disnakertrans menurunkan produk yang **sedang tayang** |
| `PRODUCT_PUBLISHED` | admin, disnakertrans | admin atau disnakertrans mengaktifkan produk (kini tampil di landing) |
| `PRODUCT_UPDATED` | admin, disnakertrans | tenant mengubah produk |
| `PRODUCT_DELETED` | admin, disnakertrans | tenant menghapus produk (tanpa `entityType` / `entityId`: produknya sudah tidak ada) |
| `TENANT_PROFILE_UPDATED` | admin | tenant mengubah profil tenantnya |
| `TENANT_REGISTERED` | admin | tenant baru mendaftar |
| `PRODUCT_UNDER_REVIEW` | tenant (pemilik) | tenant membuat produk |
| `PRODUCT_APPROVED` | tenant (pemilik) | produknya diaktifkan (juga saat diaktifkan kembali) |
| `PRODUCT_TAKEN_DOWN` | tenant (pemilik) | admin atau disnakertrans menolak atau menonaktifkan produknya; deskripsi diakhiri `Reason: <alasan>` |
| `PRODUCT_CHANGES_SAVED` | tenant (pemilik) | tenant mengubah produknya (menyebutkan apakah tetap tayang atau menunggu peninjauan) |
| `PRODUCT_REVIEWED` | tenant (pemilik) | pengunjung memberi ulasan pada produknya |

Setiap notifikasi: `id`, `type` (dipakai frontend untuk menentukan tampilan), `name` (judul), `description` (pesan), `entityType` + `entityId` (data yang dibuka: `user`, `product`, atau `tenant`), `approvalId` + `approval`, `isRead`, `readAt`, `createdAt`.

**Notifikasi aktivasi** (`USER_REGISTERED`, `ADMIN_PENDING_ACTIVATION`, `TENANT_REGISTERED`, `PRODUCT_SUBMITTED`, `PRODUCT_UNDER_REVIEW`, `PRODUCT_PUBLISHED`, `PRODUCT_APPROVED`, `PRODUCT_DEACTIVATED`, `USER_DEACTIVATED`, `PRODUCT_TAKEN_DOWN`, `PRODUCT_CHANGES_SAVED`, `PRODUCT_REVIEWED`) menyertakan approval dari user/produk yang dibahas:
```json
"approval": { "id": 137, "type": "user", "userId": "<id>", "isActive": false, "reason": "Waiting for activation by disnakertrans", "updatedAt": "...",
  "user": { "id": "<id>", "firstName": "Andi", "lastName": "Wijaya", "email": "...", "phoneNumber": "...", "role": "admin", "tenantName": null, ... } }
```
`approval.isActive` adalah status **terkini** (bukan salinan saat notifikasi dikirim), sehingga frontend bisa menampilkan tombol *Aktifkan* hanya selama nilainya masih `false`. Untuk mengaktifkan: `PATCH /api/approvals/{entityId}?type={entityType}` (body `{ "isActive": true, "role": "admin" }` untuk user, `{ "isActive": true }` untuk produk). Notifikasi lain (`PRODUCT_UPDATED`, `TENANT_PROFILE_UPDATED`) memiliki `approvalId: null`, `approval: null`. Jika produk dihapus, `approval` menjadi `null`. Setiap user hanya bisa melihat notifikasinya sendiri (milik orang lain → 404).

Endpoint: `GET /api/notifications?page=&limit=&unread=true` (terbaru di atas, `meta.unreadCount` untuk badge), `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`, `DELETE /api/notifications/:id`. `approval.user` adalah pemilik approval tersebut (pemilik akun, atau tenant pemilik produk); tidak pernah berisi password.

=== REQ List Notifications (All roles) => Daftar Notifikasi
Notifikasi milik Anda, terbaru di atas. `meta.unreadCount` untuk badge. Menyimpan notifikasi terbaru sebagai `{{notificationId}}`.

=== REQ Unread Count (All roles) => Jumlah Belum Dibaca

=== REQ Mark Notification Read (All roles) => Tandai Sudah Dibaca

=== REQ Mark All Read (All roles) => Tandai Semua Sudah Dibaca
Mengembalikan `{ updated }` (jumlah yang ditandai).

=== REQ Delete Notification (All roles) => Hapus Notifikasi

=== FOLDER Stats => Statistik
Statistik dashboard (`/api/stats`, Bearer `{{token}}`) untuk grafik di dashboard superadmin, disnakertrans, dan admin. Dihitung di database, sehingga frontend tidak perlu memuat semua data. Grafik log API ada di *Log → Statistik Log*.

=== REQ Stats Overview (superadmin, disnakertrans, admin) => Ringkasan Statistik
Angka untuk grafik dashboard. `products.byStatus` (active / pending / rejected / inactive, aturan yang sama dengan status produk di frontend), `products.outOfStock` (`total`: semua produk yang ditandai "Stok Kosong" oleh penjualnya, `active`: yang disetujui, sudah termasuk dalam `byStatus.active` tetapi disembunyikan dari halaman publik), `products.byCategory` (produk per kategori produk, ditambah "Tanpa kategori" untuk produk lama yang belum memilikinya), `tenants.byArea`, `users.byRole` (aktif / tidak aktif) **hanya untuk role yang boleh dilihat pemanggil** (superadmin: semua, disnakertrans: admin, admin: tenant), dan `perDay` (produk, UMKM, dan akun baru per hari, serta `outOfStock` / `backInStock`: produk yang ditandai "Stok Kosong" / "Tersedia" kembali oleh penjualnya hari itu; termasuk hari tanpa data). Hari dihitung dalam WIT (`Asia/Jayapura`).

=== FOLDER Logs => Log
Log permintaan dan error API (`/api/logs`, Bearer `{{token}}`), **hanya superadmin**, hanya-baca.

Yang disimpan, satu baris saat responsnya dikirim: setiap permintaan **tambah / ubah / hapus** (POST, PUT, PATCH, DELETE) **dari pengguna yang login** (permintaan dengan token kedaluwarsa atau tidak valid juga, tanpa pengguna), dan **setiap aktivitas akun, juga dari tamu**: login (termasuk email atau password salah), daftar, OTP, tautan aktivasi, kirim ulang, lupa / reset password, logout, ubah profil (`GET /api/auth/me` yang dipanggil setiap halaman tidak). Permintaan baca dan permintaan tamu lainnya (ulasan, bot) tidak disimpan. Satu baris berisi: `method`, `path`, `query`, `statusCode`, `durationMs`, `level` (`info` < 400, `warn` 4xx, `error` 5xx), siapa yang memanggil (`userId`, `userEmail`, `userRole`; null untuk tamu), `authEmail` (aktivitas akun: email yang diberikan, mis. untuk login yang gagal, atau email akun dari `userId` yang dikirim), `ip`, `userAgent`. `requestFields` (**nama** field yang dikirim, tidak pernah isinya, ditambah `image` untuk unggahan) dan `responseSummary` (ringkasan aman dari respons yang berhasil: hanya kunci yang diizinkan seperti `id`, `name`, `email`, `role`, `isActive`, `price`, `stars`, juga di dalam `user` / `approval` / `product` / `tenant`; daftar menjadi `{ count }`; token dan password tidak mungkin tersimpan). Permintaan yang gagal juga menyimpan error yang diterima klien (`errorCode`, `errorMessage`, `errorDetails`); error 5xx juga menyimpan stack trace error aslinya di `errorStack` (hanya di *Get Log*; klien tidak pernah melihatnya).

- Body permintaan tidak pernah disimpan, dan nilai query rahasia (`token`, `otp`, `password`, `code`) disimpan sebagai `***`.
- Baris yang lebih lama dari `LOG_RETENTION_DAYS` (bawaan 30 hari) dihapus setiap hari.

=== REQ List Logs (superadmin) => Daftar Log
Terbaru di atas, berhalaman (`limit` maksimal 100). Semua filter opsional dan dapat digabung. `outcome=failed` menampilkan semua permintaan yang gagal (4xx, mis. password salah atau data tidak valid, dan 5xx kesalahan server); `level` mempersempitnya ke salah satunya. Filter `email` mencari bagian dari alamat; dengan `emailExact=true` seluruh alamat harus sama (log satu orang, dipakai *Profil Pengguna*). Tanpa `errorStack`. Menyimpan log terbaru sebagai `{{logId}}`.

=== REQ Log Stats (superadmin) => Statistik Log
Angka untuk grafik log API selama `days` hari terakhir (WIT): `total`, `success`, `failed`, `perDay` (berhasil / gagal), `byMethod`, `byRole` (`guest` untuk aktivitas akun tanpa login), `topEndpoints` (id pada alamat digabung menjadi `:id`, beserta jumlah yang gagal) dan `topErrors`.

=== REQ Get Log (superadmin) => Detail Log
Satu log lengkap, termasuk `errorStack` untuk error 5xx. 404 jika tidak ada (atau sudah dihapus).

=== FOLDER Server Guide => Panduan Server
Cara server disiapkan dan dirawat (service, deploy, database, backup), untuk pengelola server. Buka `{{baseUrl}}/api/docs/server` di browser lalu masuk sebagai **superadmin**. Halaman memiliki dua bahasa (**ID / EN**) dan dua tema (**terang / gelap**); kedua pilihan diingat di browser. Sumber panduan: `docs/SERVER-GUIDE.md` (Inggris) dan `docs/SERVER-GUIDE.id.md` (Bahasa Indonesia) di repository ini; keduanya harus selalu sama isinya.

=== REQ Server Guide Page (Public) => Halaman Panduan Server
Buka di browser. Halaman meminta login **superadmin** (*Auth → Login*), menyimpan token hanya untuk tab tersebut, lalu memuat *Isi Panduan Server*. Dibuka dari menu **Panduan Server** di dashboard superadmin (domain website, lewat proxy `/api`), login dashboard langsung dipakai tanpa login ulang. Role lain ditolak dan langsung dikeluarkan lagi. Halaman ini sendiri tidak berisi informasi server. Script: `/api/docs/server/app.js` dan `/api/docs/server/theme.js`. Content-Security-Policy halaman ini juga mengizinkan gambar dari website (`FRONTEND_URL`): tangkapan layar panduan adalah berkas milik frontend (`public/panduan/`).

=== REQ Server Guide Content (superadmin) => Isi Panduan Server
Panduan server dalam bentuk HTML, beserta `lang` dan `updatedAt` (kapan file terakhir diubah). Query `lang`: `id` (bawaan, `docs/SERVER-GUIDE.id.md`) atau `en` (`docs/SERVER-GUIDE.md`). Gambar yang ditulis sebagai `panduan/<nama>.jpg` mengarah ke `<FRONTEND_URL>/panduan/`. Dibaca dari file setiap request, sehingga mengubahnya tidak perlu restart. Dikirim dengan `Cache-Control: no-store`. Role lain mendapat 403.

=== FOLDER Server Monitor => Monitor Server
CPU, memori, dan disk server, layanan yang dibutuhkan situs, serta pemakaian ruang, untuk halaman **Monitor Server** di dashboard superadmin (`/api/server`).

**Langsung:** setelah terhubung ke Socket.IO (*Realtime*), superadmin mengirim `monitor:watch`; server lalu mengirim `server:metrics` setiap 3 detik sampai `monitor:unwatch` atau koneksi terputus. Selama tidak ada yang melihat, tidak ada yang dikumpulkan, dan tidak ada yang pernah disimpan.

**Peringatan disk:** setiap 10 menit backend memeriksa disk dengan sendirinya. Pada `DISK_ALERT_PERCENT` (bawaan 90; 0 = mati) atau lebih, backend mengirim email ke `DISK_ALERT_EMAIL_TO` (bawaan: akun SMTP), dalam Bahasa Indonesia, berisi apa yang memakai ruang dan apa yang dapat dikosongkan; paling sering sekali sehari selama disk masih sepenuh itu.

=== REQ Server Metrics (superadmin) => Keadaan Server
Satu pembacaan server tempat API berjalan: `cpu.percent` (porsi sibuk semua core sejak pembacaan sebelumnya), `memory` dan `disk` (byte dan persen; `disk.alertPercent` adalah batas pengiriman email peringatan disk, 0 = mati), `host` (lama menyala, jumlah core, beban rata-rata), `app` (versi Node, lama berjalan dan memori backend), `services` (keadaan `prafi-backend`, `prafi-frontend`, `prafi-maintenance`, `postgresql`, `nginx`: `active`, `inactive`, `failed`, `activating`, atau `unknown`), dan `storage` (ukuran database, foto unggahan, dan cadangan di server, serta cadangan mingguan terbaru).

Halaman **Monitor Server** di dashboard menampilkannya sekali, lalu mengikuti event langsung `server:metrics` (*Realtime*), yang dikirim setiap `meta.pushSeconds` detik selama ada superadmin yang membuka halaman itu. Tidak ada yang disimpan. Dikirim dengan `Cache-Control: no-store`. Role lain mendapat 403.

=== FOLDER Realtime (WebSocket) => Realtime (WebSocket)
Notifikasi realtime (dan, untuk superadmin, log API langsung) melalui **Socket.IO** (host dan port yang sama dengan API).

> File koleksi Postman tidak bisa memuat request Socket.IO, jadi buat satu secara manual (sekali saja):
> 1. **New → Socket.IO**, URL `{{baseUrl}}` (versi client: **v4**).
> 2. **Headers**: `Authorization` = `Bearer {{token}}` (atau **Settings → Handshake auth**: `{ "token": "{{token}}" }`).
> 3. Tab **Events**: tambahkan listener `notification:new`, `notification:unread-count`, `session:ended`, `review:changed` (superadmin juga `log:new`) lalu aktifkan.
> 4. **Connect**. Lalu jalankan request dari koleksi ini di tab lain (mis. buat produk sebagai tenant) dan lihat event yang masuk.
> 5. Simpan ke koleksi ini (Save → Prafi API) agar berada di samping request REST.

**Auth**: access token yang sama dengan REST API. Token yang tidak ada/tidak valid/kedaluwarsa/dicabut atau user yang dinonaktifkan akan ditolak dengan `connect_error` (`err.message`, `err.data.code` mis. `UNAUTHORIZED`, `USER_NOT_ACTIVATED`).

**Event (server → client)**

| event | payload | kapan |
|---|---|---|
| `notification:unread-count` | `{ count }` | tepat setelah terhubung, dan setelah tandai dibaca / tandai semua / hapus (menyinkronkan semua tab) |
| `notification:new` | `{ notification, unreadCount }` | notifikasi baru dibuat untuk user ini (bentuknya sama dengan item `GET /api/notifications`) |
| `session:ended` | `{ reason, message }` | `reason`: `logged_out` (token ini logout), `deactivated` (akun dinonaktifkan), `token_expired` (token habis: 1 jam tanpa aktivitas, atau batas sesi 12 jam), `password_reset` (kata sandi diatur ulang), `email_changed` (admin mengubah email penjual ini; verifikasi email baru). Server lalu memutus koneksi; frontend sebaiknya me-logout user. |
| `log:new` | `{ log }` | **hanya superadmin**: satu baris baru tersimpan di log API (bentuknya sama dengan item `GET /api/logs`, tanpa `errorStack`) |
| `review:changed` | `{ reviewId, productId, action }` | **penjual** produk tersebut (setiap perubahan ulasan) serta **admin + disnakertrans** (laporan dan keputusan): ulasan `created`, `reported`, `hidden`, `kept`, atau `unhidden`. Halaman Ulasan memuat ulang daftarnya |
| `server:metrics` | pembacaan dari *Keadaan Server* | **superadmin yang mengirim `monitor:watch`** (halaman Monitor Server): setiap 3 detik sampai `monitor:unwatch` atau koneksi terputus. Satu-satunya event yang dikirim client adalah `monitor:watch` dan `monitor:unwatch` (tanpa payload) |
| `session:renew` (client → server) | `{ token }` | setelah *Perpanjang Sesi*, halaman menyerahkan token baru agar koneksi ini hidup selama token itu. Tanpa itu server menutup koneksi saat token lama habis (`session:ended`, `token_expired`). Token dari sesi atau user lain diabaikan |

Setiap user hanya menerima event miliknya (ditambah event untuk role-nya, mis. `log:new` untuk superadmin); semua tab/perangkat milik user tersebut ikut menerimanya.

**Frontend (socket.io-client v4)**
```js
import { io } from 'socket.io-client';

const socket = io(API_URL, { auth: (cb) => cb({ token: localStorage.getItem('token') }) });
socket.on('notification:unread-count', ({ count }) => setBadge(count));
socket.on('notification:new', ({ notification, unreadCount }) => { addToList(notification); setBadge(unreadCount); toast(notification.name); });
socket.on('session:ended', ({ message }) => { logout(); alert(message); });
socket.on('connect_error', (err) => { if (['UNAUTHORIZED', 'USER_NOT_ACTIVATED'].includes(err.data?.code)) logout(); });
// setelah login lagi (token baru): socket.disconnect().connect();
```

Request di bawah hanya memeriksa bahwa endpoint Socket.IO bisa dijangkau (handshake engine.io, tanpa event).

=== REQ Socket.IO Endpoint Reachable (Public) => Cek Endpoint Socket.IO
Handshake Engine.IO: 200 dengan session id berarti server realtime berjalan. Untuk menerima event, buat request Socket.IO (lihat deskripsi folder).

=== FOLDER Examples => Contoh
Contoh route yang dilindungi role, berguna untuk mengecek role dari `{{token}}` saat ini.

=== REQ Admin Ping (superadmin, admin) => Ping Admin

=== REQ Role Ping (All roles) => Ping Role
Membalas dengan role dan email Anda.
