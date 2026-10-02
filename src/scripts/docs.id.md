Bahasa Indonesia untuk dokumentasi API (npm run docs).
Setiap bagian dicocokkan dengan nama folder / request di koleksi Postman:
  === OVERVIEW
  === FOLDER <nama folder di Postman> => <judul Indonesia>
  === REQ <nama request di Postman> => <judul Indonesia>
Baris "**Access:**" tidak perlu ditulis (diambil dari nama request). Bagian yang belum diterjemahkan tampil dalam bahasa Inggris dan dilaporkan saat generate.

=== OVERVIEW
Backend API untuk Prafi (Express + Sequelize + PostgreSQL), dengan notifikasi realtime melalui Socket.IO.

## Persiapan (sekali saja)
1. Import koleksi ini dan `Prafi-Local.postman_environment.json`, lalu pilih **Prafi Local** (dropdown environment, kanan atas).
2. Di **Prafi Local**, isi `loginEmail` / `loginPassword` (kolom Current value) dengan akun superadmin dari `.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`), lalu Ctrl+S.
3. Jalankan server (`npm run dev` atau `npm run build && npm start`). `baseUrl` adalah `http://localhost:4000`.

## Login dan role
- Setiap request memakai **Bearer `{{token}}`** (diatur di koleksi; request mewarisinya). Request publik memakai *No Auth*.
- **Auth → Login** menyimpan token ke `{{token}}` (berlaku **1 jam**). Untuk berganti role, ubah `loginEmail` / `loginPassword` (atau body Login) lalu kirim Login lagi.
- **Nama setiap request menunjukkan siapa yang boleh memanggilnya**: `(All roles)` = superadmin, admin, dan tenant; `(superadmin, admin)`, `(admin)`, `(tenant)`… = hanya role tersebut; `(Public)` = tanpa login. Role lain mendapat **403**.

| role | dibuat oleh | status awal | dapat |
|---|---|---|---|
| superadmin | seed (`npm run db:seed`) | aktif | mendaftarkan admin, mengaktifkan akun admin/tenant, membaca semua data, mengelola kategori tenant |
| admin | superadmin (*Register Admin*) | **tidak aktif** sampai diaktifkan superadmin | mengaktifkan akun tenant **dan produk**, membaca user/produk/tenant, mengelola kategori tenant |
| tenant | pendaftaran publik (*Register Tenant*) | aktif | mengelola produk dan profil tenant miliknya sendiri |

## Endpoint
| folder | endpoint | akses |
|---|---|---|
| Health | `GET /api/health` | Publik |
| Auth | `POST /api/auth/login` | Publik |
| Auth | `POST /api/auth/logout` | Semua role |
| Auth | `POST /api/auth/register/admin` | superadmin |
| Auth | `POST /api/auth/register/tenant` | Publik |
| Auth | `GET /api/auth/me` | Semua role |
| Auth | `PATCH /api/auth/me` | Semua role |
| Gambar | `POST /api/images` | Semua role |
| Gambar | `GET {{imagePath}}` | Publik |
| Gambar | `DELETE /api/images/{{imageId}}` | tenant |
| Pengguna | `GET /api/users` | superadmin, admin |
| Persetujuan | `PATCH /api/approvals/{{userId}}` | superadmin, admin |
| Persetujuan | `PATCH /api/approvals/{{productId}}` | admin |
| Produk | `GET /api/products` | Semua role |
| Produk | `GET /api/products/{{productId}}` | Semua role |
| Produk | `POST /api/products` | tenant |
| Produk | `PATCH /api/products/{{productId}}` | tenant |
| Produk | `DELETE /api/products/{{productId}}` | tenant |
| Landing | `GET /api/landing/products` | Publik |
| Kategori Tenant | `GET /api/tenant-categories` | superadmin, admin |
| Kategori Tenant | `GET /api/tenant-categories/{{categoryId}}` | superadmin, admin |
| Kategori Tenant | `POST /api/tenant-categories` | superadmin, admin |
| Kategori Tenant | `PATCH /api/tenant-categories/{{categoryId}}` | superadmin, admin |
| Kategori Tenant | `DELETE /api/tenant-categories/{{categoryId}}` | superadmin, admin |
| Tenant | `GET /api/tenants/me` | tenant |
| Tenant | `POST /api/tenants/me` | tenant |
| Tenant | `PATCH /api/tenants/me` | tenant |
| Tenant | `DELETE /api/tenants/me` | tenant |
| Tenant | `GET /api/tenants` | superadmin, admin |
| Tenant | `GET /api/tenants/{{tenantProfileId}}` | superadmin, admin |
| Notifikasi | `GET /api/notifications` | Semua role |
| Notifikasi | `GET /api/notifications/unread-count` | Semua role |
| Notifikasi | `PATCH /api/notifications/{{notificationId}}/read` | Semua role |
| Notifikasi | `PATCH /api/notifications/read-all` | Semua role |
| Notifikasi | `DELETE /api/notifications/{{notificationId}}` | Semua role |
| Contoh | `GET /api/admin/ping` | superadmin, admin |
| Contoh | `GET /api/tenant/ping` | Semua role |
| Realtime (WebSocket) | Socket.IO di `{{baseUrl}}` | Semua role (Bearer token) |

## Variabel yang disimpan
Request menyimpan nilai yang dibutuhkan request berikutnya: `token`, `currentUserId`, `currentRole` (Login) · `userId`, `userRole`, `registeredEmail` (Register) · `imageId`, `imagePath` (Upload Image) · `productId` · `categoryId` · `tenantProfileId` · `notificationId`. Setiap penyimpanan dicetak di Postman Console.

## Contoh alur
1. **Login** sebagai superadmin → **Register Admin** → **Activate / Deactivate User** (mengaktifkan admin baru) → **Create Tenant Category**.
2. **Register Tenant** → isi `loginEmail` = `{{registeredEmail}}`, `loginPassword` = `{{newUserPassword}}` → **Login** (sekarang sebagai tenant) → **Upload Image** → **Create My Tenant** → **Upload Image** lagi → **Create Product**.
3. **Login** sebagai admin (`admin…@prafi.test` / `{{newUserPassword}}`) → **List Notifications** → **Activate / Deactivate Product** → produk muncul di **Landing Products**.

## Respons
- Berhasil: `{ "success": true, "data": …, "meta"?: { page, limit, total, totalPages } }`
- Gagal: `{ "success": false, "error": { "code", "message", "details"? } }`
- `message` dan `details[].message` berbahasa **Indonesia** (siap ditampilkan di frontend). `code` dan `field` tetap berbahasa Inggris; logika frontend sebaiknya memakai `code`.

| status | code (contoh) | arti |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST`, `ID_NOT_PROVIDED` | input tidak valid (`details` berisi daftar field) |
| 401 | `UNAUTHORIZED` | token tidak ada/tidak valid/kedaluwarsa/sudah logout → login lagi |
| 403 | `FORBIDDEN`, `USER_NOT_ACTIVATED` | role tidak sesuai, atau akun belum diaktifkan |
| 404 | `NOT_FOUND` | tidak ditemukan, atau bukan milik Anda |
| 409 | `UNIQUE_CONSTRAINT`, `STILL_IN_USE`, `CONFLICT` | nilai duplikat, data masih digunakan |
| 413 | `FILE_TOO_LARGE` | gambar lebih dari 5 MB |

## Notifikasi dan realtime
Setiap role menerima notifikasi untuk kejadian yang berkaitan dengannya (lihat **Notifikasi**); notifikasi aktivasi menyertakan `approval` beserta `userId` dan `user`. Notifikasi dikirim langsung melalui Socket.IO sebagai `notification:new` (lihat **Realtime (WebSocket)** untuk cara terhubung di Postman dan di frontend).

=== FOLDER Health => Health
Status server. Tidak perlu login.

=== REQ Health Check (Public) => Cek Status Server
Mengembalikan `{ status: "ok" }` saat API berjalan.

=== FOLDER Auth => Auth
Login, logout, pendaftaran, dan akun Anda sendiri (`/api/auth`).

**Login** menyimpan token ke `{{token}}`, yang dipakai semua request lain. Untuk bertindak sebagai role lain, ubah `loginEmail` / `loginPassword` (atau body) lalu kirim Login lagi.

**Pendaftaran**: akun admin dibuat oleh superadmin dan awalnya **tidak aktif** (aktifkan di Persetujuan). Akun tenant mendaftar sendiri secara publik dan langsung **aktif**.

=== REQ Login (Public) => Login
Masuk dan menyimpan access token sebagai `{{token}}` (berlaku 1 jam), serta `{{currentUserId}}` dan `{{currentRole}}`.

- superadmin: akun seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` di `.env`)
- admin / tenant: akun yang dibuat dengan request Register (password `{{newUserPassword}}`; email disimpan sebagai `{{registeredEmail}}`)

Error: 401 email/password salah, 403 `USER_NOT_ACTIVATED` (akun belum diaktifkan).

=== REQ Logout (All roles) => Logout
Mencabut token yang dipakai untuk request ini (sesi lain tetap login) dan mengosongkan `{{token}}`. Koneksi WebSocket yang memakai token ini menerima `session:ended` (`logged_out`).

=== REQ Register Admin (superadmin) => Daftarkan Admin
Membuat akun **admin**. Awalnya tidak aktif (`approval.isActive: false`) dan tidak bisa login sampai diaktifkan lewat *Persetujuan → Aktifkan / Nonaktifkan Pengguna*. Setiap superadmin menerima notifikasi `ADMIN_PENDING_ACTIVATION`.

Menyimpan `{{userId}}`, `{{userRole}}`, dan `{{registeredEmail}}`. Opsional: `faceImageId` (unggah gambarnya dulu).

=== REQ Register Tenant (Public) => Daftar sebagai Tenant
Pendaftaran publik, tanpa token. Tenant **langsung aktif**. `tenantName` wajib diisi. Setiap admin menerima notifikasi `TENANT_REGISTERED`.

Menyimpan `{{userId}}`, `{{userRole}}`, dan `{{registeredEmail}}`.

=== REQ Me (All roles) => Akun Saya
Akun yang sedang login beserta `faceImage` dan `approval` akunnya.

=== REQ Update Me (All roles) => Ubah Akun Saya
Mengubah akun Anda sendiri; kirim hanya field yang ingin diubah: `firstName`, `lastName`, `phoneNumber`, `email`, `faceImageId` (atau `null`), `tenantName` (khusus tenant), `password` + `currentPassword`.

`id` dan `role` tidak pernah bisa diubah. Jika `faceImageId` diganti (atau `null`), gambar lama beserta filenya dihapus.

=== FOLDER Images => Gambar
Unggah gambar (maks. 5 MB; jpg, png, webp, gif). Unggah dulu, lalu pakai id yang dikembalikan sebagai `faceImageId`, `imageId` produk, atau `logoId` tenant. File dapat diakses publik di `imgUrl`. Jika gambar sebuah data diganti, gambar lama dan filenya otomatis dihapus.

=== REQ Upload Image (All roles) => Unggah Gambar
multipart/form-data, field **image** (pilih file di Body → form-data). Menyimpan `{{imageId}}` dan `{{imagePath}}` (`imgUrl`; respons juga berisi link lengkap di `url`).

Satu gambar hanya bisa dipakai sekali: sebagai satu gambar produk, satu logo tenant, atau satu foto wajah.

=== REQ Open Image (Public) => Buka Gambar
Link publik gambar yang diunggah (`{{baseUrl}}` + `imgUrl`), seperti yang dimuat oleh frontend.

=== REQ Delete Image (tenant) => Hapus Gambar
Menghapus data dan file gambar. Gambar yang masih dipakai sebagai logo tenant tidak bisa dihapus (409 `STILL_IN_USE`).

=== FOLDER Users => Pengguna
Daftar akun. Tenant hanya punya *Auth → Akun Saya*.

=== REQ List Users (superadmin, admin) => Daftar Pengguna
superadmin melihat semua akun; admin hanya melihat akun tenant. Filter `role` opsional. Setiap user menyertakan `faceImage` dan `approval`.

=== FOLDER Approvals => Persetujuan
Mengaktifkan / menonaktifkan akun dan produk: `PATCH /api/approvals/:id?type=user|product`. `:id` adalah **id user** atau **id produk** (bukan id approval).

| type | siapa yang bisa | dampak |
|---|---|---|
| `user` | superadmin → akun admin dan tenant; admin → akun tenant | akun yang tidak aktif tidak bisa login, dan langsung diputus dari realtime |
| `product` | hanya admin | produk aktif tampil di halaman landing |

Setiap approval memiliki `type` (`user` = approval akun, `product` = approval produk) dan `userId` (pemilik akun, atau tenant pemilik produk).

=== REQ Activate / Deactivate User (superadmin, admin) => Aktifkan / Nonaktifkan Pengguna
`isActive`: true/false. `role`: role akun yang dituju, sebagai konfirmasi (harus sesuai). `reason`: opsional.

Memakai `{{userId}}` / `{{userRole}}` yang disimpan oleh request Register. Menonaktifkan akun mengakhiri sesi user tersebut (`session:ended`, reason `deactivated`).

=== REQ Activate / Deactivate Product (admin) => Aktifkan / Nonaktifkan Produk
Menyetujui produk (tampil di halaman landing) atau menurunkannya. Pemilik menerima `PRODUCT_APPROVED`; admin menerima `PRODUCT_PUBLISHED`; penonaktifan memberi tahu superadmin.

Respons menyertakan pemilik produk:
```json
{ "type": "product", "id": "…", "name": "…", "approval": { "type": "product", "userId": "…", "isActive": true, … },
  "user": { "firstName": "Budi", "lastName": "Santoso", …, "tenant": { … } | null, "productId": "…", "product": { … } } }
```

=== FOLDER Products => Produk
Tenant mengelola produknya sendiri; superadmin/admin membaca semua produk. Produk baru awalnya **tidak aktif** dan menunggu admin (*Persetujuan → Aktifkan / Nonaktifkan Produk*).

=== REQ List Products (All roles) => Daftar Produk
superadmin/admin: semua produk. tenant: hanya produk miliknya. Filter `isActive` opsional (mis. `false` = menunggu persetujuan).

=== REQ Get Product (All roles) => Detail Produk
Tenant mendapat 404 untuk produk yang bukan miliknya.

=== REQ Create Product (tenant) => Buat Produk
Unggah gambarnya dulu (*Gambar → Unggah Gambar*); `imageId` wajib diisi. Menyimpan `{{productId}}`. Superadmin dan admin menerima `PRODUCT_SUBMITTED`, tenant menerima `PRODUCT_UNDER_REVIEW`.

=== REQ Update Product (tenant) => Ubah Produk
Hanya produk milik sendiri. Kirim salah satu dari `name`, `description`, `details`, `qty`, `imageId`. Aktivasi tidak bisa diubah di sini. Jika `imageId` diganti, gambar lama beserta filenya dihapus.

=== REQ Delete Product (tenant) => Hapus Produk
Hanya produk milik sendiri. Approval dan gambarnya ikut dihapus.

=== FOLDER Landing => Landing
Halaman publik untuk pengunjung.

=== REQ Landing Products (Public) => Produk Landing
Hanya produk aktif (sudah disetujui), tanpa data pribadi (tanpa email/telepon pemilik, tanpa alasan approval).

=== FOLDER Tenant Categories => Kategori Tenant
Kategori untuk profil tenant (mis. Kuliner, Fashion). Dikelola oleh superadmin dan admin.

=== REQ List Tenant Categories (superadmin, admin) => Daftar Kategori Tenant
Diurutkan berdasarkan nama.

=== REQ Get Tenant Category (superadmin, admin) => Detail Kategori Tenant

=== REQ Create Tenant Category (superadmin, admin) => Buat Kategori Tenant
Nama harus unik. Menyimpan `{{categoryId}}`.

=== REQ Update Tenant Category (superadmin, admin) => Ubah Kategori Tenant

=== REQ Delete Tenant Category (superadmin, admin) => Hapus Kategori Tenant
Kategori yang masih dipakai oleh profil tenant tidak bisa dihapus (409 `STILL_IN_USE`).

=== FOLDER Tenants => Tenant
Profil tenant (toko). User tenant mengelola profil **miliknya sendiri** di `/api/tenants/me`; superadmin/admin membaca semua profil.

=== REQ Get My Tenant (tenant) => Profil Tenant Saya
404 jika Anda belum membuat profil.

=== REQ Create My Tenant (tenant) => Buat Profil Tenant Saya
Satu profil per tenant. Wajib: semua field kecuali `name` (bawaan: tenantName Anda). `logoId`: unggah logo dulu. `categoryId`: kategori tenant (dibuat oleh superadmin/admin). Menyimpan `{{tenantProfileId}}`.

=== REQ Update My Tenant (tenant) => Ubah Profil Tenant Saya
Kirim hanya field yang ingin diubah. Admin menerima `TENANT_PROFILE_UPDATED`. Jika `logoId` diganti, logo lama beserta filenya dihapus.

=== REQ Delete My Tenant (tenant) => Hapus Profil Tenant Saya
Menghapus profil tenant Anda (akun Anda tetap ada).

=== REQ List Tenants (superadmin, admin) => Daftar Tenant
Semua profil tenant beserta pemilik, logo, dan kategorinya. Filter `categoryId` opsional.

=== REQ Get Tenant (superadmin, admin) => Detail Tenant

=== FOLDER Notifications => Notifikasi
Notifikasi untuk setiap role (`/api/notifications`, Bearer `{{token}}`). Notifikasi dibuat otomatis oleh aksi di folder lain.

| type | penerima | kapan |
|---|---|---|
| `ADMIN_PENDING_ACTIVATION` | superadmin | admin baru didaftarkan (perlu diaktifkan) |
| `PRODUCT_SUBMITTED` | superadmin, admin | tenant membuat produk |
| `USER_DEACTIVATED` | superadmin | admin menonaktifkan akun user |
| `PRODUCT_DEACTIVATED` | superadmin | admin menonaktifkan produk |
| `PRODUCT_PUBLISHED` | admin | admin mengaktifkan produk (kini tampil di landing) |
| `PRODUCT_UPDATED` | admin | tenant mengubah produk |
| `TENANT_PROFILE_UPDATED` | admin | tenant mengubah profil tenantnya |
| `TENANT_REGISTERED` | admin | tenant baru mendaftar |
| `PRODUCT_UNDER_REVIEW` | tenant (pemilik) | tenant membuat produk |
| `PRODUCT_APPROVED` | tenant (pemilik) | produknya diaktifkan |

Setiap notifikasi: `id`, `type` (dipakai frontend untuk menentukan tampilan), `name` (judul), `description` (pesan), `entityType` + `entityId` (data yang dibuka: `user`, `product`, atau `tenant`), `approvalId` + `approval`, `isRead`, `readAt`, `createdAt`.

**Notifikasi aktivasi** (`ADMIN_PENDING_ACTIVATION`, `TENANT_REGISTERED`, `PRODUCT_SUBMITTED`, `PRODUCT_UNDER_REVIEW`, `PRODUCT_PUBLISHED`, `PRODUCT_APPROVED`, `PRODUCT_DEACTIVATED`, `USER_DEACTIVATED`) menyertakan approval dari user/produk yang dibahas:
```json
"approval": { "id": 137, "type": "user", "userId": "<id>", "isActive": false, "reason": "Waiting for activation by a superadmin", "updatedAt": "...",
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

=== FOLDER Realtime (WebSocket) => Realtime (WebSocket)
Notifikasi realtime melalui **Socket.IO** (host dan port yang sama dengan API).

> File koleksi Postman tidak bisa memuat request Socket.IO, jadi buat satu secara manual (sekali saja):
> 1. **New → Socket.IO**, URL `{{baseUrl}}` (versi client: **v4**).
> 2. **Headers**: `Authorization` = `Bearer {{token}}` (atau **Settings → Handshake auth**: `{ "token": "{{token}}" }`).
> 3. Tab **Events**: tambahkan listener `notification:new`, `notification:unread-count`, `session:ended` lalu aktifkan.
> 4. **Connect**. Lalu jalankan request dari koleksi ini di tab lain (mis. buat produk sebagai tenant) dan lihat event yang masuk.
> 5. Simpan ke koleksi ini (Save → Prafi API) agar berada di samping request REST.

**Auth**: access token yang sama dengan REST API. Token yang tidak ada/tidak valid/kedaluwarsa/dicabut atau user yang dinonaktifkan akan ditolak dengan `connect_error` (`err.message`, `err.data.code` mis. `UNAUTHORIZED`, `USER_NOT_ACTIVATED`).

**Event (server → client)**

| event | payload | kapan |
|---|---|---|
| `notification:unread-count` | `{ count }` | tepat setelah terhubung, dan setelah tandai dibaca / tandai semua / hapus (menyinkronkan semua tab) |
| `notification:new` | `{ notification, unreadCount }` | notifikasi baru dibuat untuk user ini (bentuknya sama dengan item `GET /api/notifications`) |
| `session:ended` | `{ reason, message }` | `reason`: `logged_out` (token ini logout), `deactivated` (akun dinonaktifkan), `token_expired` (token 1 jam kedaluwarsa). Server lalu memutus koneksi; frontend sebaiknya me-logout user. |

Setiap user hanya menerima event miliknya; semua tab/perangkat milik user tersebut ikut menerimanya.

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
