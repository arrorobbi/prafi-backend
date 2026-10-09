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
4. Email: isi `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` di `.env` agar email benar-benar terkirim. Isi `FRONTEND_URL` dengan alamat frontend: email lupa kata sandi berisi link ke `<FRONTEND_URL>/reset-password`. Tanpa `SMTP_HOST` (development), email ditampilkan di log server dan OTP / token aktivasi dikembalikan di `meta.verification` serta disimpan sebagai `{{otp}}` / `{{verifyToken}}`.

## Login dan role
- Setiap request memakai **Bearer `{{token}}`** (diatur di koleksi; request mewarisinya). Request publik memakai *No Auth*.
- **Auth → Login** menyimpan token ke `{{token}}` (berlaku **1 jam**). Untuk berganti role, ubah `loginEmail` / `loginPassword` (atau body Login) lalu kirim Login lagi.
- **Nama setiap request menunjukkan siapa yang boleh memanggilnya**: `(All roles)` = superadmin, disnakertrans, admin, dan tenant; `(superadmin, disnakertrans, admin)`, `(admin)`, `(tenant)`… = hanya role tersebut; `(Public)` = tanpa login. Role lain mendapat **403**.
- Setiap akun harus memiliki **email terverifikasi** (`mailActive: true`) dan **approval aktif** (`approval.isActive: true`) untuk login dan memakai API.

| role | dibuat oleh | verifikasi email | approval awal | dapat |
|---|---|---|---|---|
| superadmin | seed (`npm run db:seed`) | sudah terverifikasi | aktif | membuat akun disnakertrans; **hanya membaca** data lainnya (user, produk, tenant, kategori produk); menerima notifikasi setiap akun dan produk baru |
| disnakertrans | superadmin (*Register Disnakertrans*) | link aktivasi (24 jam) | aktif | melihat serta mengaktifkan/menonaktifkan akun **admin** dan **produk**, melihat semua produk dan tenant, mengelola kategori produk |
| admin | daftar sendiri (*Register Admin*) | OTP (15 menit) | **tidak aktif** sampai diaktifkan disnakertrans | mengaktifkan akun tenant **dan produk**, membaca user (tenant)/produk/tenant, mengelola kategori produk |
| tenant | daftar sendiri (*Register Tenant*) | OTP (15 menit) | aktif | mengelola produk dan profil tenant miliknya sendiri |

## Endpoint
| folder | endpoint | akses |
|---|---|---|
| Health | `GET /api/health` | Publik |
| Auth | `POST /api/auth/login` | Publik |
| Auth | `POST /api/auth/logout` | Semua role |
| Auth | `POST /api/auth/register/disnakertrans` | superadmin |
| Auth | `POST /api/auth/register/admin` | Publik |
| Auth | `POST /api/auth/register/tenant` | Publik |
| Auth | `POST /api/auth/verify-otp/{{userId}}` | Publik |
| Auth | `GET /api/auth/verify-email/{{userId}}` | Publik |
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
| Persetujuan | `PATCH /api/approvals/{{userId}}` | disnakertrans, admin |
| Persetujuan | `PATCH /api/approvals/{{productId}}` | disnakertrans, admin |
| Produk | `GET /api/products` | Semua role |
| Produk | `GET /api/products/{{productId}}` | Semua role |
| Produk | `POST /api/products` | tenant |
| Produk | `PATCH /api/products/{{productId}}` | tenant |
| Produk | `DELETE /api/products/{{productId}}` | tenant |
| Landing | `GET /api/landing/categories` | Publik |
| Landing | `GET /api/landing/products` | Publik |
| Landing | `GET /api/landing/products/{{productId}}` | Publik |
| Landing | `GET /api/landing/products/{{productId}}/reviews` | Publik |
| Landing | `POST /api/landing/products/{{productId}}/reviews` | Publik |
| Landing | `GET /api/landing/tenants` | Publik |
| Landing | `GET /api/landing/tenants/{{tenantProfileId}}` | Publik |
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
| Contoh | `GET /api/admin/ping` | superadmin, admin |
| Contoh | `GET /api/tenant/ping` | Semua role |
| Realtime (WebSocket) | Socket.IO di `{{baseUrl}}` | Semua role (Bearer token) |

## Variabel yang disimpan
Request menyimpan nilai yang dibutuhkan request berikutnya: `token`, `currentUserId`, `currentRole` (Login) · `userId`, `userRole`, `registeredEmail`, `otp` / `verifyToken` (Register, Resend) · `resetToken` (Forgot Password) · `imageId`, `imagePath` (Upload Image) · `productId` · `categoryId` · `tenantProfileId` · `notificationId` · `logId`. Setiap penyimpanan dicetak di Postman Console.

## Contoh alur
1. **Login** sebagai superadmin → **Register Disnakertrans** → **Verify Email Link** (atau buka link dari email).
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
| 400 | `OTP_INVALID`, `OTP_EXPIRED`, `LINK_INVALID`, `LINK_EXPIRED`, `RESET_LINK_INVALID`, `RESET_LINK_EXPIRED` | kode / link verifikasi / link atur ulang kata sandi salah atau kedaluwarsa |
| 401 | `UNAUTHORIZED` | token tidak ada/tidak valid/kedaluwarsa/sudah logout, atau kata sandi telah diatur ulang → login lagi |
| 403 | `FORBIDDEN`, `EMAIL_NOT_VERIFIED`, `USER_NOT_ACTIVATED` | role tidak sesuai, email belum diverifikasi, atau akun belum diaktifkan |
| 404 | `NOT_FOUND` | tidak ditemukan, atau bukan milik Anda |
| 409 | `UNIQUE_CONSTRAINT`, `STILL_IN_USE`, `CONFLICT`, `EMAIL_ALREADY_VERIFIED` | nilai duplikat, data masih digunakan, sudah terverifikasi |
| 413 | `FILE_TOO_LARGE` | gambar lebih dari 5 MB |
| 429 | `TOO_MANY_REQUESTS` | kode verifikasi baru diminta kurang dari 60 detik yang lalu |

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
| disnakertrans | superadmin (*Register Disnakertrans*) | **link** aktivasi di email (berlaku 24 jam) | langsung aktif |
| admin | sendiri (*Register Admin*, publik) | **OTP** 6 digit di email (berlaku 15 menit) | **tidak aktif** sampai diaktifkan disnakertrans |
| tenant | sendiri (*Register Tenant*, publik) | **OTP** 6 digit di email (berlaku 15 menit) | langsung aktif |

Setiap akun baru dimulai dengan `mailActive: false`: login dan semua endpoint yang memerlukan token menjawab **403 `EMAIL_NOT_VERIFIED`** sampai email diverifikasi. Email dikirim dalam Bahasa Indonesia.

**Development:** tanpa `SMTP_HOST` di `.env`, email tidak dikirim tetapi ditampilkan di log server, dan respons register/resend menyertakan `meta.verification.devCode` / `devLink`, yang disimpan request sebagai `{{otp}}` / `{{verifyToken}}`.

**Lupa kata sandi:** *Lupa Kata Sandi* mengirim email berisi link ke halaman frontend `<FRONTEND_URL>/reset-password?userId=…&token=…` (berlaku 30 menit, sekali pakai). Halaman tersebut memanggil *Cek Link Atur Ulang*, lalu *Atur Ulang Kata Sandi* dengan kata sandi baru. Pengaturan ulang mengakhiri semua sesi yang ada.

=== REQ Login (Public) => Login
Masuk dan menyimpan access token sebagai `{{token}}` (berlaku 1 jam), serta `{{currentUserId}}` dan `{{currentRole}}`.

- superadmin: akun seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` di `.env`)
- disnakertrans / admin / tenant: akun yang dibuat dengan request Register (password `{{newUserPassword}}`; email disimpan sebagai `{{registeredEmail}}`)

Error: 401 email/password salah, 403 `EMAIL_NOT_VERIFIED` (verifikasi email dulu; `details` berisi `userId` dan `method`), 403 `USER_NOT_ACTIVATED` (akun belum diaktifkan). Lupa kata sandi? Gunakan *Lupa Kata Sandi*.

`data.user` adalah profil lengkap, sama seperti *Profil Saya* (`faceImage`, `approval`), sehingga foto dapat langsung ditampilkan setelah login.

=== REQ Logout (All roles) => Logout
Mencabut token yang dipakai untuk request ini (sesi lain tetap login) dan mengosongkan `{{token}}`. Koneksi WebSocket yang memakai token ini menerima `session:ended` (`logged_out`).

=== REQ Register Disnakertrans (superadmin) => Daftarkan Disnakertrans
Membuat akun **disnakertrans** (pemberi persetujuan akun admin). Approval-nya langsung aktif (`approval.isActive: true`), tetapi emailnya harus diaktifkan dulu: email berbahasa Indonesia memberi tahu bahwa akun telah dibuat dan berisi link aktivasi publik (*Aktivasi Email lewat Link*, berlaku 24 jam). Password adalah yang dikirim di body; berikan sendiri kepada orang tersebut.

Memberi tahu setiap superadmin (`USER_REGISTERED`). Menyimpan `{{userId}}`, `{{userRole}}`, `{{registeredEmail}}`, dan saat development `{{verifyToken}}`.

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

=== REQ Verify Email Link (Public) => Aktivasi Email lewat Link
Akun disnakertrans: link aktivasi dari email. Jika dibuka di browser, menampilkan halaman konfirmasi (Bahasa Indonesia); client API mendapat JSON. Jika berhasil, `mailActive` menjadi `true`.

Error: 400 `LINK_INVALID`, 400 `LINK_EXPIRED` (lebih dari 24 jam), 409 `EMAIL_ALREADY_VERIFIED`.

=== REQ Resend Verification (Public) => Kirim Ulang Verifikasi
Mengirim OTP baru (admin, tenant) atau link aktivasi baru (disnakertrans); kode sebelumnya tidak berlaku lagi. Paling sering sekali per 60 detik (429 `TOO_MANY_REQUESTS`, `details.retryAfterSeconds`). Menyimpan `{{otp}}` / `{{verifyToken}}` baru saat development.

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
Mengubah akun Anda sendiri; kirim hanya field yang ingin diubah: `firstName`, `lastName`, `phoneNumber`, `email`, `faceImageId` (atau `null`), `tenantName` (khusus tenant), `password` + `currentPassword`.

`id`, `role`, dan `mailActive` tidak pernah bisa diubah di sini. Jika `faceImageId` diganti (atau `null`), gambar lama beserta filenya dihapus.

=== FOLDER Images => Gambar
Unggah gambar (maks. 5 MB; jpg, png, webp, gif). Unggah dulu, lalu pakai id yang dikembalikan sebagai `faceImageId`, `imageId` produk, atau `logoId` tenant. File dapat diakses publik di `imgUrl`. Jika gambar sebuah data diganti, gambar lama dan filenya otomatis dihapus.

Setiap kegagalan unggah memiliki pesan yang jelas dan `code` sendiri: `IMAGE_REQUIRED` (tanpa file), `EMPTY_IMAGE` (0 byte), `UNSUPPORTED_IMAGE_TYPE` (mis. `image/heic` dari iPhone), `INVALID_IMAGE_CONTENT` (isi file bukan gambar), `FILE_TOO_LARGE` (413, lebih dari 5 MB), `UPLOAD_INCOMPLETE` (koneksi terputus), `IMAGE_STORAGE_FAILED` / `IMAGE_SAVE_FAILED` (500, penyimpanan atau database server).

=== REQ Upload Image (All roles) => Unggah Gambar
multipart/form-data, field **image** (pilih file di Body → form-data). Menyimpan `{{imageId}}` dan `{{imagePath}}` (`imgUrl`; respons juga berisi link lengkap di `url`).

Satu gambar hanya bisa dipakai sekali: sebagai satu gambar produk, satu logo tenant, atau satu foto wajah.

=== REQ Open Image (Public) => Buka Gambar
Link publik gambar yang diunggah (`{{baseUrl}}` + `imgUrl`), seperti yang dimuat oleh frontend.

=== REQ Delete Image (tenant) => Hapus Gambar
Menghapus data dan file gambar. Gambar yang masih dipakai sebagai logo tenant tidak bisa dihapus (409 `STILL_IN_USE`).

=== FOLDER Users => Pengguna
Daftar akun. superadmin melihat semua akun, disnakertrans melihat akun admin, admin melihat akun tenant. Tenant hanya punya *Auth → Akun Saya*.

=== REQ List Users (superadmin, disnakertrans, admin) => Daftar Pengguna
superadmin: semua akun; disnakertrans: hanya akun admin; admin: hanya akun tenant. Filter `role` opsional. Setiap user menyertakan `faceImage`, `approval`, dan `mailActive`.

=== FOLDER Approvals => Persetujuan
Mengaktifkan / menonaktifkan akun dan produk: `PATCH /api/approvals/:id?type=user|product`. `:id` adalah **id user** atau **id produk** (bukan id approval).

| type | siapa yang bisa | dampak |
|---|---|---|
| `user` | disnakertrans → akun admin; admin → akun tenant | akun yang tidak aktif tidak bisa login, dan langsung diputus dari realtime |
| `product` | disnakertrans, admin | produk aktif tampil di halaman landing |

Superadmin **hanya membaca** dan tidak bisa mengaktifkan apa pun (akun disnakertrans yang dibuatnya langsung aktif). Setiap penonaktifan akun memberi tahu superadmin (`USER_DEACTIVATED`).

Setiap approval memiliki `type` (`user` = approval akun, `product` = approval produk) dan `userId` (pemilik akun, atau tenant pemilik produk).

=== REQ Activate / Deactivate User (disnakertrans, admin) => Aktifkan / Nonaktifkan Pengguna
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
Profil tenant Anda harus **lengkap** terlebih dahulu (*Tenant → Buat Profil Tenant Saya*) dan akun Anda harus memiliki **foto profil** (`faceImageId`, *Auth → Ubah Profil Saya*); jika belum, 403 `TENANT_PROFILE_INCOMPLETE` dengan `details.missingFields` (mis. `["faceImageId"]`). Unggah gambarnya dulu (*Gambar → Unggah Gambar*); `imageId` wajib diisi. `categoryId` wajib: kategori produk (*Kategori Produk → Daftar*). `isRecommended` tidak boleh dikirim: server yang mengaturnya (lihat *Landing → Tulis Ulasan*). Menyimpan `{{productId}}`. Superadmin, admin, dan disnakertrans menerima `PRODUCT_SUBMITTED`, tenant menerima `PRODUCT_UNDER_REVIEW`.

=== REQ Update Product (tenant) => Ubah Produk
Hanya produk milik sendiri. Kirim salah satu dari `name`, `description`, `details`, `price`, `categoryId`, `imageId`. Aktivasi dan `isRecommended` tidak bisa diubah di sini. Admin dan disnakertrans menerima `PRODUCT_UPDATED`. Jika `imageId` diganti, gambar lama beserta filenya dihapus.

=== REQ Delete Product (tenant) => Hapus Produk
Hanya produk milik sendiri. Approval, ulasan, dan gambarnya ikut dihapus. Admin dan disnakertrans menerima `PRODUCT_DELETED`.

=== FOLDER Landing => Landing
Halaman publik untuk pengunjung: tanpa token, tanpa data pribadi (tanpa email/telepon pemilik, tanpa alasan approval). Hanya produk yang **sudah disetujui** dan UMKM yang akun pemiliknya aktif yang ditampilkan.

**Ulasan** juga publik: siapa pun dapat membaca dan menulis ulasan tanpa login (`name`, `stars` 1–5, `review`), hanya untuk produk yang sudah disetujui. Maksimal 5 ulasan per pengunjung (IP) per 10 menit (429 `TOO_MANY_REQUESTS`). Produk memiliki `ratingAverage` (1 desimal, `null` jika belum ada ulasan) dan `reviewCount`; UMKM memiliki `productCount`, `ratingAverage`, dan `reviewCount` dari produknya yang sudah disetujui.

=== REQ Landing Categories (Public) => Kategori Landing
Semua kategori produk urut A→Z beserta `image` (null hanya untuk kategori lama yang belum diberi gambar) dan `productCount` (hanya produk yang sudah disetujui), untuk carousel beranda: setiap slide adalah gambar kategori, dan di sebelahnya *Produk Landing* dengan `categoryId` menampilkan produk kategori tersebut.

=== REQ Landing Products (Public) => Produk Landing
Hanya produk yang sudah disetujui, terbaru di atas, masing-masing dengan `category` (`id`, `name`). Filter opsional: `recommended=true` (produk dengan rata-rata ulasan **4,8 bintang atau lebih**, diatur server), `tenantId` (produk satu pemilik), `categoryId` (satu kategori, mis. slide carousel yang sedang tampil), dan `sort` (`newest` sebagai bawaan, atau `rating`: rata-rata tertinggi di atas, produk tanpa ulasan di bawah). `tenant.tenant` pada setiap produk adalah profil UMKM pemiliknya (`id`, `name`, dan tautan publiknya `whatsappLink`, `instagramLink`, `shopeeLink`, `googleBusinessLink`, `fbLink`, `gmapsLink`; yang kosong bernilai `null` atau `"-"`) untuk *Detail UMKM Landing* dan tombol kontak di halaman produk.

=== REQ Landing Product (Public) => Detail Produk Landing
Satu produk yang sudah disetujui beserta `ratingAverage` / `reviewCount`. 404 untuk produk yang tidak ada atau belum disetujui.

=== REQ List Reviews (Public) => Daftar Ulasan
Ulasan sebuah produk, terbaru di atas. `meta.ratingAverage` dan `meta.reviewCount` untuk ringkasan bintang.

=== REQ Create Review (Public) => Tulis Ulasan
Tanpa login. `name` (maks. 100), `stars` (bilangan bulat 1–5), `review` (maks. 1000). Hanya untuk produk yang sudah disetujui. Mengembalikan ulasan beserta `meta.ratingAverage` / `meta.reviewCount` terbaru produk tersebut. Maksimal 5 per pengunjung per 10 menit (429).

Setelah setiap ulasan, `isRecommended` produk dihitung ulang: `true` selama rata-rata ulasannya (1 desimal, seperti yang tampil) **4,8 atau lebih**.

=== REQ Landing Tenants (Public) => Daftar UMKM Landing
UMKM (profil tenant) yang akun pemiliknya aktif, urut A→Z, masing-masing dengan logo, `productCount` (produk yang sudah disetujui), `ratingAverage`, dan `reviewCount`. Opsional `q` (cari nama). Menyimpan yang pertama sebagai `{{tenantProfileId}}`.

=== REQ Landing Tenant (Public) => Detail UMKM Landing
Satu UMKM beserta ringkasannya. Id boleh berupa id profil **atau id user pemiliknya** (`product.tenant.id`), sehingga halaman produk dapat langsung menautkan ke UMKM-nya. Produknya: *Produk Landing* dengan `tenantId` = `userId`.

=== FOLDER Product Categories => Kategori Produk
Kategori produk (mis. Kuliner, Kerajinan). Dikelola oleh disnakertrans dan admin; semua role yang login dapat membacanya (superadmin dan tenant hanya membaca). Tenant memilih salah satunya untuk setiap produk (`categoryId`). Setiap kategori **wajib** memiliki gambar (`imageId`, unggah dulu melalui *Gambar → Unggah Gambar*): carousel halaman landing menampilkannya, dengan produk kategori tersebut di sebelahnya. Pengunjung membaca daftarnya melalui *Landing → Kategori Landing*. Setiap kategori membawa `productCount`.

=== REQ List Product Categories (All roles) => Daftar Kategori Produk
Diurutkan berdasarkan nama, masing-masing dengan `image` dan `productCount` (semua produknya, status apa pun).

=== REQ Get Product Category (All roles) => Detail Kategori Produk

=== REQ Create Product Category (disnakertrans, admin) => Buat Kategori Produk
Nama harus unik. `imageId` **wajib** (unggah gambarnya dulu; satu gambar per kategori): carousel di halaman landing menampilkannya. Menyimpan `{{categoryId}}`.

=== REQ Update Product Category (disnakertrans, admin) => Ubah Kategori Produk
Kirim `name` dan/atau `imageId`. `imageId` baru menggantikan gambar (gambar lama beserta filenya dihapus). Gambar tidak bisa dihapus (`imageId: null` → 400), hanya diganti. Kategori lama yang belum punya gambar sebaiknya segera diberi gambar.

=== REQ Delete Product Category (disnakertrans, admin) => Hapus Kategori Produk
Kategori yang masih dipakai produk tidak bisa dihapus (409 `STILL_IN_USE`, `details.productCount`): pindahkan dulu produknya ke kategori lain. Gambarnya (beserta file) ikut dihapus.

=== FOLDER Tenants => Tenant
Profil tenant (toko). User tenant mengelola profil **miliknya sendiri** di `/api/tenants/me`; superadmin, disnakertrans, dan admin membaca semua profil.

**Tautan:** `whatsappLink` dan `gmapsLink` wajib (frontend menyimpan `"-"` untuk tautan Google Maps yang kosong). `fbLink` **wajib berupa tautan** `http(s)://`: `"-"` atau kosong ditolak (400), dan profil lama yang masih `"-"` dianggap belum lengkap (`missingFields` berisi `fbLink`) sehingga belum bisa menambah produk. `instagramLink`, `googleBusinessLink`, dan `shopeeLink` **opsional**: tautan `http(s)://`, atau `null` / `""` jika tidak ada (disimpan sebagai `null`). Tautan opsional tidak pernah membuat profil dianggap belum lengkap.

=== REQ Get My Tenant (tenant) => Profil Tenant Saya
404 jika Anda belum membuat profil. `isComplete` / `missingFields`: produk baru dapat dibuat setelah semua field wajib terisi (tautan opsional tidak dihitung). `missingFields` juga berisi `faceImageId` selama akun Anda belum memiliki foto profil..

=== REQ Create My Tenant (tenant) => Buat Profil Tenant Saya
Satu profil per tenant. Wajib: semua field kecuali `name` (bawaan: tenantName Anda) dan tautan opsional `instagramLink`, `googleBusinessLink`, `shopeeLink`. `logoId`: unggah logo dulu. Profil tidak lagi memiliki kategori: setiap produk yang memilikinya (`categoryId`). Menyimpan `{{tenantProfileId}}`.

=== REQ Update My Tenant (tenant) => Ubah Profil Tenant Saya
Kirim hanya field yang ingin diubah. Kirim `null` (atau `""`) untuk menghapus tautan opsional. Admin menerima `TENANT_PROFILE_UPDATED`. Jika `logoId` diganti, logo lama beserta filenya dihapus.

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
Angka untuk grafik dashboard. `products.byStatus` (active / pending / rejected / inactive, aturan yang sama dengan status produk di frontend), `products.byCategory` (produk per kategori produk, ditambah "Tanpa kategori" untuk produk lama yang belum memilikinya), `tenants.byArea`, `users.byRole` (aktif / tidak aktif) **hanya untuk role yang boleh dilihat pemanggil** (superadmin: semua, disnakertrans: admin, admin: tenant), dan `perDay` (produk, UMKM, dan akun baru per hari, termasuk hari tanpa data). Hari dihitung dalam WIT (`Asia/Jayapura`).

=== FOLDER Logs => Log
Log permintaan dan error API (`/api/logs`, Bearer `{{token}}`), **hanya superadmin**, hanya-baca.

Yang disimpan, satu baris saat responsnya dikirim: setiap permintaan **tambah / ubah / hapus** (POST, PUT, PATCH, DELETE) **dari pengguna yang login** (permintaan dengan token kedaluwarsa atau tidak valid juga, tanpa pengguna), dan **setiap aktivitas akun, juga dari tamu**: login (termasuk email atau password salah), daftar, OTP, tautan aktivasi, kirim ulang, lupa / reset password, logout, ubah profil (`GET /api/auth/me` yang dipanggil setiap halaman tidak). Permintaan baca dan permintaan tamu lainnya (ulasan, bot) tidak disimpan. Satu baris berisi: `method`, `path`, `query`, `statusCode`, `durationMs`, `level` (`info` < 400, `warn` 4xx, `error` 5xx), siapa yang memanggil (`userId`, `userEmail`, `userRole`; null untuk tamu), `authEmail` (aktivitas akun: email yang diberikan, mis. untuk login yang gagal, atau email akun dari `userId` yang dikirim), `ip`, `userAgent`. `requestFields` (**nama** field yang dikirim, tidak pernah isinya, ditambah `image` untuk unggahan) dan `responseSummary` (ringkasan aman dari respons yang berhasil: hanya kunci yang diizinkan seperti `id`, `name`, `email`, `role`, `isActive`, `price`, `stars`, juga di dalam `user` / `approval` / `product` / `tenant`; daftar menjadi `{ count }`; token dan password tidak mungkin tersimpan). Permintaan yang gagal juga menyimpan error yang diterima klien (`errorCode`, `errorMessage`, `errorDetails`); error 5xx juga menyimpan stack trace error aslinya di `errorStack` (hanya di *Get Log*; klien tidak pernah melihatnya).

- Body permintaan tidak pernah disimpan, dan nilai query rahasia (`token`, `otp`, `password`, `code`) disimpan sebagai `***`.
- Baris yang lebih lama dari `LOG_RETENTION_DAYS` (bawaan 30 hari) dihapus setiap hari.

=== REQ List Logs (superadmin) => Daftar Log
Terbaru di atas, berhalaman (`limit` maksimal 100). Semua filter opsional dan dapat digabung. `outcome=failed` menampilkan semua permintaan yang gagal (4xx, mis. password salah atau data tidak valid, dan 5xx kesalahan server); `level` mempersempitnya ke salah satunya. Tanpa `errorStack`. Menyimpan log terbaru sebagai `{{logId}}`.

=== REQ Log Stats (superadmin) => Statistik Log
Angka untuk grafik log API selama `days` hari terakhir (WIT): `total`, `success`, `failed`, `perDay` (berhasil / gagal), `byMethod`, `byRole` (`guest` untuk aktivitas akun tanpa login), `topEndpoints` (id pada alamat digabung menjadi `:id`, beserta jumlah yang gagal) dan `topErrors`.

=== REQ Get Log (superadmin) => Detail Log
Satu log lengkap, termasuk `errorStack` untuk error 5xx. 404 jika tidak ada (atau sudah dihapus).

=== FOLDER Server Guide => Panduan Server
Cara server disiapkan dan dirawat (service, deploy, database, backup), untuk pengelola server. Buka `{{baseUrl}}/api/docs/server` di browser lalu masuk sebagai **superadmin**. Sumber panduan: `docs/SERVER-GUIDE.md` di repository ini.

=== REQ Server Guide Page (Public) => Halaman Panduan Server
Buka di browser. Halaman meminta login **superadmin** (*Auth → Login*), menyimpan token hanya untuk tab tersebut, lalu memuat *Isi Panduan Server*. Dibuka dari menu **Panduan Server** di dashboard superadmin (domain website, lewat proxy `/api`), login dashboard langsung dipakai tanpa login ulang. Role lain ditolak dan langsung dikeluarkan lagi. Halaman ini sendiri tidak berisi informasi server. Script: `/api/docs/server/app.js`.

=== REQ Server Guide Content (superadmin) => Isi Panduan Server
Panduan server (`docs/SERVER-GUIDE.md`) dalam bentuk HTML, beserta `updatedAt` (kapan file terakhir diubah). Dibaca dari file setiap request, sehingga mengubahnya tidak perlu restart. Dikirim dengan `Cache-Control: no-store`. Role lain mendapat 403.

=== FOLDER Realtime (WebSocket) => Realtime (WebSocket)
Notifikasi realtime (dan, untuk superadmin, log API langsung) melalui **Socket.IO** (host dan port yang sama dengan API).

> File koleksi Postman tidak bisa memuat request Socket.IO, jadi buat satu secara manual (sekali saja):
> 1. **New → Socket.IO**, URL `{{baseUrl}}` (versi client: **v4**).
> 2. **Headers**: `Authorization` = `Bearer {{token}}` (atau **Settings → Handshake auth**: `{ "token": "{{token}}" }`).
> 3. Tab **Events**: tambahkan listener `notification:new`, `notification:unread-count`, `session:ended` (superadmin juga `log:new`) lalu aktifkan.
> 4. **Connect**. Lalu jalankan request dari koleksi ini di tab lain (mis. buat produk sebagai tenant) dan lihat event yang masuk.
> 5. Simpan ke koleksi ini (Save → Prafi API) agar berada di samping request REST.

**Auth**: access token yang sama dengan REST API. Token yang tidak ada/tidak valid/kedaluwarsa/dicabut atau user yang dinonaktifkan akan ditolak dengan `connect_error` (`err.message`, `err.data.code` mis. `UNAUTHORIZED`, `USER_NOT_ACTIVATED`).

**Event (server → client)**

| event | payload | kapan |
|---|---|---|
| `notification:unread-count` | `{ count }` | tepat setelah terhubung, dan setelah tandai dibaca / tandai semua / hapus (menyinkronkan semua tab) |
| `notification:new` | `{ notification, unreadCount }` | notifikasi baru dibuat untuk user ini (bentuknya sama dengan item `GET /api/notifications`) |
| `session:ended` | `{ reason, message }` | `reason`: `logged_out` (token ini logout), `deactivated` (akun dinonaktifkan), `token_expired` (token 1 jam kedaluwarsa), `password_reset` (kata sandi diatur ulang). Server lalu memutus koneksi; frontend sebaiknya me-logout user. |
| `log:new` | `{ log }` | **hanya superadmin**: satu baris baru tersimpan di log API (bentuknya sama dengan item `GET /api/logs`, tanpa `errorStack`) |

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
