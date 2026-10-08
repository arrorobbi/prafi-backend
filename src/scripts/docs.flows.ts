/**
 * Flowcharts for the API docs: one or more per Postman folder, drawn as inline SVG at build time
 * (the /docs Content-Security-Policy blocks external scripts such as Mermaid).
 * Texts are in both languages here; keep them in step with the routes and services when the logic changes.
 */

export type Lang = 'en' | 'id';
type Text = string | Record<Lang, string>;
const pick = (text: Text, lang: Lang) => (typeof text === 'string' ? text : text[lang]);

type SideKind = 'error' | 'ok' | 'effect' | 'note';
interface Side {
  kind: SideKind;
  text: Text;
  /** Shown on the connector, e.g. "no" for a failed check. */
  label?: Text;
}
interface Node {
  kind: 'start' | 'step' | 'check' | 'end';
  text: Text;
  /** Boxes to the right: the error of a failed check, side effects (notifications, realtime) or notes. */
  side?: Side[];
}
interface Chart {
  title: Text;
  nodes: Node[];
}

// ---------- building blocks ----------

const NO: Text = { en: 'no', id: 'tidak' };
const YES: Text = { en: 'yes', id: 'ya' };

const start = (text: Text): Node => ({ kind: 'start', text });
const end = (text: Text, ...side: Side[]): Node => ({ kind: 'end', text, side });
const step = (text: Text, ...side: Side[]): Node => ({ kind: 'step', text, side });
/** A check: "yes" continues down, "no" ends in the response on the right (an error unless `kind` says otherwise). */
const check = (text: Text, no: Text, kind: SideKind = 'error'): Node => ({ kind: 'check', text, side: [{ kind, text: no, label: NO }] });
const effect = (text: Text): Side => ({ kind: 'effect', text });
const note = (text: Text): Side => ({ kind: 'note', text });

/** `authenticate` (+ `authorize(...)` when roles are given), see middlewares/auth.ts. */
const auth = (roles?: Text): Node[] => [
  check(
    { en: 'Bearer token valid? (signed, not expired, not logged out)', id: 'Token Bearer valid? (asli, belum kedaluwarsa, belum logout)' },
    '401 Unauthorized',
  ),
  check({ en: 'Account still exists?', id: 'Akun masih ada?' }, '401 Unauthorized'),
  check({ en: 'Email verified? (`mailActive`)', id: 'Email terverifikasi? (`mailActive`)' }, '403 EMAIL_NOT_VERIFIED'),
  check({ en: 'Account activated?', id: 'Akun sudah aktif?' }, '403 USER_NOT_ACTIVATED'),
  ...(roles ? [check({ en: `Role is ${pick(roles, 'en')}?`, id: `Role adalah ${pick(roles, 'id')}?` }, '403 Forbidden')] : []),
];
const SA_ADMIN: Text = { en: 'superadmin or admin', id: 'superadmin atau admin' };
const CATEGORY_READERS: Text = { en: 'superadmin, admin or tenant', id: 'superadmin, admin atau tenant' };
const DK_ADMIN: Text = { en: 'disnakertrans or admin', id: 'disnakertrans atau admin' };
const READERS: Text = { en: 'superadmin, disnakertrans or admin', id: 'superadmin, disnakertrans atau admin' };
const SEND_OTP = effect({ en: 'Email (Bahasa Indonesia): account created + 6-digit OTP, valid 15 min', id: 'Email: akun dibuat + OTP 6 digit, berlaku 15 menit' });

// ---------- flows per Postman folder ----------

export const FLOWS: Record<string, Chart[]> = {
  Health: [
    {
      title: { en: 'Health check', id: 'Cek status' },
      nodes: [start('GET /api/health'), step({ en: 'No token needed', id: 'Tanpa token' }), end('200 { status: "ok" }')],
    },
  ],

  Auth: [
    {
      title: 'Login',
      nodes: [
        start('POST /api/auth/login'),
        check({ en: 'Email and password correct?', id: 'Email dan password benar?' }, { en: '401 Wrong email or password', id: '401 Email atau password salah' }),
        check({ en: 'Email verified? (`mailActive`)', id: 'Email terverifikasi? (`mailActive`)' }, '403 EMAIL_NOT_VERIFIED { userId, method }'),
        check({ en: 'Account activated?', id: 'Akun sudah aktif?' }, '403 USER_NOT_ACTIVATED'),
        step({ en: 'Sign an access token (valid 1 hour)', id: 'Buat access token (berlaku 1 jam)' }),
        end('200 { accessToken, user }'),
      ],
    },
    {
      title: { en: 'Register Tenant (public)', id: 'Daftar sebagai Tenant (publik)' },
      nodes: [
        start('POST /api/auth/register/tenant'),
        check({ en: 'Body valid?', id: 'Body valid?' }, { en: '400 Validation failed', id: '400 Validasi gagal' }),
        check({ en: '`faceImageId` exists? (if sent)', id: '`faceImageId` ada? (jika dikirim)' }, '400'),
        check({ en: 'Email not registered yet?', id: 'Email belum terdaftar?' }, '409 Conflict'),
        step(
          { en: 'Create user (`mailActive: false`) + approval (active)', id: 'Buat user (`mailActive: false`) + approval (aktif)' },
          SEND_OTP,
          effect({ en: 'Notify admins (TENANT_REGISTERED) + superadmins (USER_REGISTERED)', id: 'Notifikasi ke admin (TENANT_REGISTERED) + superadmin (USER_REGISTERED)' }),
        ),
        end(
          { en: '201 profile + meta.verification', id: '201 profil + meta.verification' },
          note({ en: 'Logs in after Verify OTP', id: 'Bisa login setelah Verifikasi OTP' }),
        ),
      ],
    },
    {
      title: { en: 'Register Admin (public)', id: 'Daftar sebagai Admin (publik)' },
      nodes: [
        start('POST /api/auth/register/admin'),
        check({ en: 'Body valid and email free?', id: 'Body valid dan email belum dipakai?' }, '400 / 409'),
        step(
          { en: 'Create user (`mailActive: false`) + approval (inactive)', id: 'Buat user (`mailActive: false`) + approval (tidak aktif)' },
          SEND_OTP,
          effect({ en: 'Notify disnakertrans (ADMIN_PENDING_ACTIVATION) + superadmins (USER_REGISTERED)', id: 'Notifikasi ke disnakertrans (ADMIN_PENDING_ACTIVATION) + superadmin (USER_REGISTERED)' }),
        ),
        end(
          { en: '201 profile + meta.verification', id: '201 profil + meta.verification' },
          note({ en: 'Logs in after Verify OTP and activation by a disnakertrans', id: 'Bisa login setelah Verifikasi OTP dan diaktifkan disnakertrans' }),
        ),
      ],
    },
    {
      title: { en: 'Register Disnakertrans', id: 'Daftarkan Disnakertrans' },
      nodes: [
        start('POST /api/auth/register/disnakertrans'),
        check(
          { en: 'Bearer token valid, email verified, account active?', id: 'Token Bearer valid, email terverifikasi, akun aktif?' },
          '401 / 403',
        ),
        check({ en: 'Role is superadmin?', id: 'Role adalah superadmin?' }, '403 Forbidden'),
        check({ en: 'Body valid and email free?', id: 'Body valid dan email belum dipakai?' }, '400 / 409'),
        step(
          { en: 'Create user (`mailActive: false`) + approval (active)', id: 'Buat user (`mailActive: false`) + approval (aktif)' },
          effect({ en: 'Email (Bahasa Indonesia): account created + activation link, valid 24 h', id: 'Email: akun dibuat + link aktivasi, berlaku 24 jam' }),
          effect({ en: 'Notify superadmins (USER_REGISTERED)', id: 'Notifikasi ke superadmin (USER_REGISTERED)' }),
        ),
        end(
          { en: '201 profile + meta.verification', id: '201 profil + meta.verification' },
          note({ en: 'Logs in after opening the link', id: 'Bisa login setelah membuka link' }),
        ),
      ],
    },
    {
      title: { en: 'Verify OTP (admin, tenant)', id: 'Verifikasi OTP (admin, tenant)' },
      nodes: [
        start('POST /api/auth/ verify-otp/:userId { otp }'),
        check({ en: 'userId a UUID and otp 6 digits?', id: 'userId berupa UUID dan otp 6 digit?' }, { en: '400 Validation failed', id: '400 Validasi gagal' }),
        check({ en: 'User exists?', id: 'Pengguna ada?' }, '404'),
        check({ en: 'Email not verified yet?', id: 'Email belum terverifikasi?' }, '409 EMAIL_ALREADY_VERIFIED'),
        check({ en: 'Unused code within 15 minutes?', id: 'Kode belum dipakai dan masih dalam 15 menit?' }, '400 OTP_INVALID / OTP_EXPIRED'),
        check({ en: 'Fewer than 5 wrong tries?', id: 'Kurang dari 5 kali salah?' }, { en: '400 request a new code', id: '400 minta kode baru' }),
        check({ en: 'Code matches?', id: 'Kode cocok?' }, { en: '400 OTP_INVALID { attemptsLeft }', id: '400 OTP_INVALID { attemptsLeft }' }),
        step({ en: 'Mark the code used, set `mailActive: true`', id: 'Tandai kode terpakai, set `mailActive: true`' }),
        end({ en: '200 profile, can log in', id: '200 profil, bisa login' }),
      ],
    },
    {
      title: { en: 'Verify Email Link (disnakertrans)', id: 'Aktivasi Email lewat Link (disnakertrans)' },
      nodes: [
        start('GET /api/auth/ verify-email/:userId?token='),
        check({ en: 'User exists and email not verified yet?', id: 'Pengguna ada dan email belum terverifikasi?' }, '404 / 409'),
        check({ en: 'Token matches and not used?', id: 'Token cocok dan belum dipakai?' }, '400 LINK_INVALID'),
        check({ en: 'Within 24 hours?', id: 'Masih dalam 24 jam?' }, '400 LINK_EXPIRED'),
        step({ en: 'Set `mailActive: true`', id: 'Set `mailActive: true`' }),
        end(
          { en: 'Browser: confirmation page · API: 200 JSON', id: 'Browser: halaman konfirmasi · API: 200 JSON' },
        ),
      ],
    },
    {
      title: { en: 'Resend Verification', id: 'Kirim Ulang Verifikasi' },
      nodes: [
        start('POST /api/auth/ resend-verification/:userId'),
        check({ en: 'User exists and email not verified yet?', id: 'Pengguna ada dan email belum terverifikasi?' }, '404 / 409'),
        check({ en: 'Last code sent over 60 s ago?', id: 'Kode terakhir dikirim lebih dari 60 detik lalu?' }, '429 TOO_MANY_REQUESTS'),
        step(
          { en: 'Replace the old code with a new one', id: 'Ganti kode lama dengan yang baru' },
          effect({ en: 'Email: new OTP (admin, tenant) or new link (disnakertrans)', id: 'Email: OTP baru (admin, tenant) atau link baru (disnakertrans)' }),
        ),
        end({ en: '200 + meta.verification', id: '200 + meta.verification' }),
      ],
    },
    {
      title: { en: 'Forgot / Reset Password', id: 'Lupa / Atur Ulang Kata Sandi' },
      nodes: [
        start('POST /api/auth/ forgot-password { email }'),
        check(
          { en: 'Email has an account and no link sent in the last 60 s?', id: 'Email punya akun dan belum dikirimi link 60 detik terakhir?' },
          { en: '200 same answer, nothing sent', id: '200 jawaban sama, tidak ada yang dikirim' },
          'ok',
        ),
        step(
          { en: 'New single-use token (30 min), older reset links stop working', id: 'Token baru sekali pakai (30 menit), link lama tidak berlaku' },
          effect({ en: 'Email: link to <FRONTEND_URL>/reset-password?userId=…&token=…', id: 'Email: link ke <FRONTEND_URL>/reset-password?userId=…&token=…' }),
        ),
        step({ en: 'Frontend page: POST /reset-password/check', id: 'Halaman frontend: POST /reset-password/check' }),
        check({ en: 'Token matches, unused, within 30 min?', id: 'Token cocok, belum dipakai, masih 30 menit?' }, '400 RESET_LINK_INVALID / EXPIRED'),
        step({ en: 'POST /reset-password { userId, token, password }', id: 'POST /reset-password { userId, token, password }' }),
        check({ en: 'Password at least 8 characters?', id: 'Kata sandi minimal 8 karakter?' }, { en: '400 Validation failed', id: '400 Validasi gagal' }),
        step(
          { en: 'Save hashed password, `mailActive: true`, token used', id: 'Simpan kata sandi (hash), `mailActive: true`, token terpakai' },
          effect({ en: 'Older tokens → 401, sockets get session:ended (password_reset)', id: 'Token lama → 401, socket menerima session:ended (password_reset)' }),
        ),
        end({ en: '200, log in with the new password', id: '200, login dengan kata sandi baru' }),
      ],
    },
    {
      title: 'Logout',
      nodes: [
        start('POST /api/auth/logout'),
        ...auth(),
        check({ en: 'Token has an id (`jti`)?', id: 'Token punya id (`jti`)?' }, { en: '400 old token, wait until it expires', id: '400 token lama, tunggu kedaluwarsa' }),
        step(
          { en: 'Revoke this token', id: 'Cabut token ini' },
          effect({ en: 'Close the sockets using this token (session:ended)', id: 'Tutup socket yang memakai token ini (session:ended)' }),
        ),
        end({ en: '200, other sessions stay logged in', id: '200, sesi lain tetap login' }),
      ],
    },
    {
      title: { en: 'Me / Update Me', id: 'Akun Saya / Ubah Akun Saya' },
      nodes: [
        start('GET · PATCH /api/auth/me'),
        ...auth(),
        check({ en: 'Updating? (PATCH)', id: 'Mengubah? (PATCH)' }, { en: '200 your profile', id: '200 profil Anda' }, 'ok'),
        check(
          { en: 'New password: `currentPassword` correct?', id: 'Password baru: `currentPassword` benar?' },
          { en: '400 Validation failed', id: '400 Validasi gagal' },
        ),
        check({ en: '`faceImageId` exists and email free?', id: '`faceImageId` ada dan email belum dipakai?' }, '400 / 409'),
        step(
          { en: 'Save your own account (id, role and mailActive never change)', id: 'Simpan akun sendiri (id, role dan mailActive tidak berubah)' },
          effect({ en: 'Replaced face image: record + file deleted', id: 'Foto wajah lama: data + file dihapus' }),
        ),
        end({ en: '200 updated profile', id: '200 profil terbaru' }),
      ],
    },
  ],

  Images: [
    {
      title: { en: 'Upload Image', id: 'Unggah Gambar' },
      nodes: [
        start('POST /api/images (multipart)'),
        ...auth(),
        check({ en: 'Field `image`: JPEG, PNG, WebP or GIF up to 5 MB?', id: 'Field `image`: JPEG, PNG, WebP atau GIF maks. 5 MB?' }, '400'),
        step({ en: 'Save the file under a random name + Image record', id: 'Simpan file dengan nama acak + data Image' }),
        end(
          '201 { id, imgUrl, url }',
          note({ en: 'Send the id as imageId, logoId or faceImageId', id: 'Kirim id sebagai imageId, logoId atau faceImageId' }),
        ),
      ],
    },
    {
      title: { en: 'Open Image', id: 'Buka Gambar' },
      nodes: [
        start('GET /images/<file>'),
        check({ en: 'File exists?', id: 'File ada?' }, '404'),
        end({ en: '200 image (cached 7 days)', id: '200 gambar (cache 7 hari)' }),
      ],
    },
    {
      title: { en: 'Delete Image', id: 'Hapus Gambar' },
      nodes: [
        start('DELETE /api/images/:id'),
        ...auth('tenant'),
        check({ en: 'Id given and a number?', id: 'Id ada dan berupa angka?' }, '400'),
        check({ en: 'Image exists?', id: 'Gambar ada?' }, '404'),
        step({ en: 'Delete the record and the file', id: 'Hapus data dan file-nya' }),
        end('200'),
      ],
    },
  ],

  Users: [
    {
      title: { en: 'List Users', id: 'Daftar Pengguna' },
      nodes: [
        start('GET /api/users'),
        ...auth(),
        check({ en: 'Your role may list accounts?', id: 'Role Anda boleh melihat akun?' }, { en: '403 tenant: use /api/auth/me', id: '403 tenant: pakai /api/auth/me' }),
        step(
          { en: 'Scope by role', id: 'Batasi sesuai role' },
          note({ en: 'superadmin → every role', id: 'superadmin → semua role' }),
          note({ en: 'disnakertrans → admins only', id: 'disnakertrans → hanya admin' }),
          note({ en: 'admin → tenants only', id: 'admin → hanya tenant' }),
        ),
        end({ en: '200 paginated list', id: '200 daftar berhalaman' }),
      ],
    },
  ],

  Approvals: [
    {
      title: { en: 'Activate / Deactivate User', id: 'Aktifkan / Nonaktifkan Pengguna' },
      nodes: [
        start('PATCH /api/approvals/:id?type=user'),
        ...auth(DK_ADMIN),
        check({ en: 'type, UUID id, isActive and role valid?', id: 'type, id UUID, isActive dan role valid?' }, { en: '400 Validation failed', id: '400 Validasi gagal' }),
        check({ en: 'User exists?', id: 'Pengguna ada?' }, '404'),
        check({ en: 'Body role matches the user?', id: 'role di body sesuai pengguna?' }, '400'),
        check(
          { en: 'Allowed? disnakertrans → admin · admin → tenant', id: 'Diizinkan? disnakertrans → admin · admin → tenant' },
          '403 Forbidden',
        ),
        step(
          { en: 'Save approval (created the first time)', id: 'Simpan approval (dibuat jika belum ada)' },
          effect({ en: 'Deactivated → notify superadmins (USER_DEACTIVATED)', id: 'Dinonaktifkan → notifikasi ke superadmin (USER_DEACTIVATED)' }),
          effect({ en: 'Deactivated → user\'s sockets closed (session:ended)', id: 'Dinonaktifkan → socket pengguna ditutup (session:ended)' }),
        ),
        end('200 { type, id, email, role, approval }'),
      ],
    },
    {
      title: { en: 'Activate / Deactivate Product', id: 'Aktifkan / Nonaktifkan Produk' },
      nodes: [
        start('PATCH /api/approvals/:id?type=product'),
        ...auth(DK_ADMIN),
        check({ en: 'type, UUID id, isActive valid? (no role)', id: 'type, id UUID, isActive valid? (tanpa role)' }, { en: '400 Validation failed', id: '400 Validasi gagal' }),
        check({ en: 'Product exists?', id: 'Produk ada?' }, '404'),
        step(
          { en: 'Save approval (created + linked the first time)', id: 'Simpan approval (dibuat + ditautkan jika belum ada)' },
          effect({ en: 'Activated → notify admins + disnakertrans + the owning tenant', id: 'Diaktifkan → notifikasi ke admin + disnakertrans + tenant pemilik' }),
          effect({ en: 'Rejected / deactivated (or a new reason) → notify the owning tenant with the reason', id: 'Ditolak / dinonaktifkan (atau alasan baru) → notifikasi ke tenant pemilik beserta alasan' }),
          effect({ en: 'A live product taken down → notify superadmins', id: 'Produk tayang diturunkan → notifikasi ke superadmin' }),
        ),
        end(
          { en: '200 product + approval + owner', id: '200 produk + approval + pemilik' },
          note({ en: 'Active products show on /api/landing/products', id: 'Produk aktif tampil di /api/landing/products' }),
        ),
      ],
    },
  ],

  Products: [
    {
      title: { en: 'List / Get Product', id: 'Daftar / Detail Produk' },
      nodes: [
        start('GET /api/products[/:id]'),
        ...auth(),
        step(
          { en: 'Scope by role', id: 'Batasi sesuai role' },
          note({ en: 'superadmin, disnakertrans, admin → every product', id: 'superadmin, disnakertrans, admin → semua produk' }),
          note({ en: 'tenant → own products only', id: 'tenant → hanya produk sendiri' }),
        ),
        check({ en: 'Found? (single product)', id: 'Ditemukan? (satu produk)' }, { en: '404, also for another tenant\'s product', id: '404, juga untuk produk tenant lain' }),
        end({ en: '200 product, or paginated list (?isActive)', id: '200 produk, atau daftar berhalaman (?isActive)' }),
      ],
    },
    {
      title: { en: 'Create Product', id: 'Buat Produk' },
      nodes: [
        start('POST /api/products'),
        ...auth('tenant'),
        check(
          { en: 'Tenant profile complete + account photo? (optional links don\'t count)', id: 'Profil tenant lengkap + foto akun? (tautan opsional tidak dihitung)' },
          { en: '403 TENANT_PROFILE_INCOMPLETE + missingFields', id: '403 TENANT_PROFILE_INCOMPLETE + missingFields' },
        ),
        check({ en: 'Body valid? (price in rupiah, isRecommended)', id: 'Body valid? (price dalam Rupiah, isRecommended)' }, { en: '400 Validation failed', id: '400 Validasi gagal' }),
        check({ en: '`imageId` exists?', id: '`imageId` ada?' }, { en: '400 upload it first: POST /api/images', id: '400 unggah dulu: POST /api/images' }),
        check({ en: 'Image not used by another product?', id: 'Gambar belum dipakai produk lain?' }, '409 Conflict'),
        step(
          { en: 'Create product + approval (inactive)', id: 'Buat produk + approval (tidak aktif)' },
          effect({ en: 'Notify superadmins + admins + disnakertrans: review it', id: 'Notifikasi ke superadmin + admin + disnakertrans: tinjau' }),
          effect({ en: 'Notify you: under review', id: 'Notifikasi ke Anda: sedang ditinjau' }),
        ),
        end(
          { en: '201 product', id: '201 produk' },
          note({ en: 'On the landing page once an admin or disnakertrans activates it', id: 'Tampil di landing setelah diaktifkan admin atau disnakertrans' }),
        ),
      ],
    },
    {
      title: { en: 'Update Product', id: 'Ubah Produk' },
      nodes: [
        start('PATCH /api/products/:id'),
        ...auth('tenant'),
        check({ en: 'Your own product?', id: 'Produk milik Anda?' }, '404'),
        check({ en: 'New `imageId` exists? (if sent)', id: '`imageId` baru ada? (jika dikirim)' }, '400'),
        step(
          { en: 'Save changes', id: 'Simpan perubahan' },
          effect({ en: 'Replaced image: record + file deleted', id: 'Gambar lama: data + file dihapus' }),
          effect({ en: 'Notify admins + disnakertrans: product updated', id: 'Notifikasi ke admin + disnakertrans: produk diubah' }),
        ),
        end({ en: '200 product', id: '200 produk' }),
      ],
    },
    {
      title: { en: 'Delete Product', id: 'Hapus Produk' },
      nodes: [
        start('DELETE /api/products/:id'),
        ...auth('tenant'),
        check({ en: 'Your own product?', id: 'Produk milik Anda?' }, '404'),
        step(
          { en: 'Delete product + its approval', id: 'Hapus produk + approval-nya' },
          effect({ en: 'Image record + file deleted', id: 'Data + file gambar dihapus' }),
        ),
        end('200'),
      ],
    },
  ],

  Landing: [
    {
      title: { en: 'Landing Products', id: 'Produk Landing' },
      nodes: [
        start('GET /api/landing/products'),
        step({ en: 'No token needed', id: 'Tanpa token' }),
        step({ en: 'Only products whose approval is active', id: 'Hanya produk dengan approval aktif' }),
        step({ en: 'Public fields only (no owner email/phone, no reason)', id: 'Hanya field publik (tanpa email/telepon pemilik, tanpa reason)' }),
        step({ en: 'Optional: ?recommended=true, ?tenantId=', id: 'Opsional: ?recommended=true, ?tenantId=' }),
        end(
          { en: '200 paginated list, newest first', id: '200 daftar berhalaman, terbaru dulu' },
          note({ en: 'Each with ratingAverage + reviewCount', id: 'Masing-masing dengan ratingAverage + reviewCount' }),
        ),
      ],
    },
    {
      title: { en: 'Reviews', id: 'Ulasan' },
      nodes: [
        start('GET · POST /api/landing/products/:id/reviews'),
        step({ en: 'No token needed', id: 'Tanpa token' }),
        check({ en: 'Product approved?', id: 'Produk sudah disetujui?' }, '404'),
        check({ en: 'POST: name, stars 1-5, review valid?', id: 'POST: name, stars 1-5, review valid?' }, { en: '400 Validation failed', id: '400 Validasi gagal' }),
        check({ en: 'POST: under 5 reviews per visitor in 10 min?', id: 'POST: kurang dari 5 ulasan per pengunjung dalam 10 menit?' }, '429 TOO_MANY_REQUESTS'),
        end(
          { en: '200 reviews / 201 review', id: '200 ulasan / 201 ulasan' },
          note({ en: 'meta: the product\'s ratingAverage + reviewCount', id: 'meta: ratingAverage + reviewCount produk' }),
        ),
      ],
    },
    {
      title: { en: 'Landing Tenants (UMKM)', id: 'UMKM Landing' },
      nodes: [
        start('GET /api/landing/tenants[/:id]'),
        step({ en: 'No token needed', id: 'Tanpa token' }),
        step({ en: 'Only UMKM whose owner account is active', id: 'Hanya UMKM yang akun pemiliknya aktif' }),
        check({ en: 'Found? (by profile id or owner user id)', id: 'Ditemukan? (id profil atau id user pemilik)' }, '404'),
        end(
          { en: '200 UMKM, A→Z', id: '200 UMKM, urut A→Z' },
          note({ en: 'productCount, ratingAverage, reviewCount of approved products', id: 'productCount, ratingAverage, reviewCount dari produk yang disetujui' }),
        ),
      ],
    },
  ],

  'Tenant Categories': [
    {
      title: { en: 'Manage Tenant Categories', id: 'Kelola Kategori Tenant' },
      nodes: [
        start('GET · POST · PATCH · DELETE /api/tenant-categories'),
        ...auth(CATEGORY_READERS),
        check({ en: 'Changing? (POST, PATCH, DELETE) only admin', id: 'Mengubah? (POST, PATCH, DELETE) hanya admin' }, { en: '403 superadmin and tenant only read', id: '403 superadmin dan tenant hanya membaca' }),
        check({ en: 'Category exists? (routes with :id)', id: 'Kategori ada? (route dengan :id)' }, '404'),
        check({ en: 'Name not taken? (POST, PATCH)', id: 'Nama belum dipakai? (POST, PATCH)' }, '409 Conflict'),
        check({ en: 'No tenant uses it? (DELETE)', id: 'Tidak dipakai tenant? (DELETE)' }, '409 STILL_IN_USE'),
        end({ en: '200 / 201 category, or list sorted by name', id: '200 / 201 kategori, atau daftar urut nama' }),
      ],
    },
  ],

  Tenants: [
    {
      title: { en: 'Create My Tenant', id: 'Buat Profil Tenant Saya' },
      nodes: [
        start('POST /api/tenants/me'),
        ...auth('tenant'),
        check({ en: 'No profile yet?', id: 'Belum punya profil?' }, { en: '409 already exists, use PATCH', id: '409 sudah ada, pakai PATCH' }),
        check({ en: '`logoId` and `tenantCategoryId` exist?', id: '`logoId` dan `tenantCategoryId` ada?' }, '400'),
        step({ en: 'Create profile (name defaults to your tenantName)', id: 'Buat profil (name default: tenantName Anda)' }),
        end({ en: '201 profile', id: '201 profil' }),
      ],
    },
    {
      title: { en: 'Update My Tenant', id: 'Ubah Profil Tenant Saya' },
      nodes: [
        start('PATCH /api/tenants/me'),
        ...auth('tenant'),
        check({ en: 'Profile exists?', id: 'Profil ada?' }, { en: '404 create it first: POST', id: '404 buat dulu: POST' }),
        check({ en: 'New logo / category exist? (if sent)', id: 'Logo / kategori baru ada? (jika dikirim)' }, '400'),
        step(
          { en: 'Save changes', id: 'Simpan perubahan' },
          effect({ en: 'Replaced logo: record + file deleted', id: 'Logo lama: data + file dihapus' }),
          effect({ en: 'Notify admins: profile updated', id: 'Notifikasi ke admin: profil diubah' }),
        ),
        end({ en: '200 profile', id: '200 profil' }),
      ],
    },
    {
      title: { en: 'Get / Delete My Tenant', id: 'Lihat / Hapus Profil Tenant Saya' },
      nodes: [
        start('GET · DELETE /api/tenants/me'),
        ...auth('tenant'),
        check({ en: 'Profile exists?', id: 'Profil ada?' }, '404'),
        step(
          { en: 'DELETE: remove profile + logo image', id: 'DELETE: hapus profil + gambar logo' },
          note({ en: 'Your products are kept', id: 'Produk Anda tetap ada' }),
        ),
        end({ en: '200 profile (GET) / null (DELETE)', id: '200 profil (GET) / null (DELETE)' }),
      ],
    },
    {
      title: { en: 'List / Get Tenants', id: 'Daftar / Detail Tenant' },
      nodes: [
        start('GET /api/tenants[/:id]'),
        ...auth(READERS),
        step({ en: 'List: optional ?tenantCategoryId filter', id: 'Daftar: filter opsional ?tenantCategoryId' }),
        check({ en: 'Tenant exists? (single tenant)', id: 'Tenant ada? (satu tenant)' }, '404'),
        end({ en: '200 tenant(s) with owner, logo, category', id: '200 tenant dengan pemilik, logo, kategori' }),
      ],
    },
  ],

  Notifications: [
    {
      title: { en: 'Read and manage', id: 'Baca dan kelola' },
      nodes: [
        start('/api/notifications…'),
        ...auth(),
        step({ en: 'Only your own notifications', id: 'Hanya notifikasi milik Anda' }),
        check({ en: 'Exists and yours? (routes with :id)', id: 'Ada dan milik Anda? (route dengan :id)' }, '404'),
        step(
          { en: 'List · unread count · mark read · read all · delete', id: 'Daftar · jumlah belum dibaca · tandai dibaca · baca semua · hapus' },
          effect({ en: 'Unread count changed → push notification:unread-count', id: 'Jumlah belum dibaca berubah → kirim notification:unread-count' }),
        ),
        end('200'),
      ],
    },
    {
      title: { en: 'How notifications are sent', id: 'Cara notifikasi dikirim' },
      nodes: [
        start({ en: 'An action is saved (sign-up, product, approval…)', id: 'Sebuah aksi tersimpan (daftar, produk, approval…)' }),
        step({ en: 'One copy per recipient (by role or user)', id: 'Satu salinan per penerima (per role atau user)' }),
        step(
          { en: 'Push notification:new { notification, unreadCount }', id: 'Kirim notification:new { notification, unreadCount }' },
          note({ en: 'To every open tab of that user', id: 'Ke semua tab yang terbuka milik user itu' }),
        ),
        end(
          { en: 'Done', id: 'Selesai' },
          note({ en: 'A failed notification is logged and never fails the action', id: 'Notifikasi gagal dicatat di log dan tidak menggagalkan aksi' }),
        ),
      ],
    },
  ],

  Logs: [
    {
      title: { en: 'How a request is logged', id: 'Cara permintaan dicatat' },
      nodes: [
        start({ en: 'A signed-in user\'s create / update / delete, or any auth action (also guests)', id: 'Tambah / ubah / hapus dari pengguna yang login, atau aktivitas akun apa pun (juga tamu)' }),
        step({ en: 'Handled as usual (success or error)', id: 'Diproses seperti biasa (berhasil atau error)' }),
        step(
          { en: 'Response sent → one row in api_logs', id: 'Respons terkirim → satu baris di api_logs' },
          note({ en: 'Field names only + a safe summary of the result; no token/password', id: 'Hanya nama field + ringkasan hasil yang aman; tanpa token/password' }),
          note({ en: '5xx also keeps the real stack trace', id: '5xx juga menyimpan stack trace aslinya' }),
        ),
        end(
          { en: 'Done', id: 'Selesai' },
          note({ en: 'A failed log write never fails the request', id: 'Gagal menyimpan log tidak menggagalkan permintaan' }),
        ),
      ],
    },
    {
      title: { en: 'Read the logs', id: 'Membaca log' },
      nodes: [
        start('/api/logs…'),
        ...auth('superadmin'),
        check({ en: 'Filters valid? (level, method, status, dates…)', id: 'Filter valid? (level, method, status, tanggal…)' }, '400 Validasi gagal'),
        check({ en: 'Log exists? (GET /api/logs/:id)', id: 'Log ada? (GET /api/logs/:id)' }, '404'),
        end({ en: '200 logs, newest first', id: '200 log, terbaru di atas' }),
      ],
    },
  ],

  'Realtime (WebSocket)': [
    {
      title: { en: 'Socket.IO connection', id: 'Koneksi Socket.IO' },
      nodes: [
        start('io(API_URL, { auth: { token } })'),
        check({ en: 'Token sent? (auth.token or Bearer header)', id: 'Token dikirim? (auth.token atau header Bearer)' }, 'connect_error 401'),
        check(
          { en: 'Same checks as REST: valid, not logged out, email verified, active?', id: 'Cek sama seperti REST: valid, belum logout, email terverifikasi, aktif?' },
          'connect_error { code, statusCode }',
        ),
        step({ en: 'Join your room user:<id>', id: 'Masuk ke room user:<id>' }),
        step({ en: 'Server sends notification:unread-count', id: 'Server mengirim notification:unread-count' }),
        step({ en: 'Receive notification:new and unread-count', id: 'Terima notification:new dan unread-count' }),
        end(
          { en: 'session:ended, then disconnect', id: 'session:ended, lalu terputus' },
          note({ en: 'token_expired · logged_out · deactivated · password_reset: log in again, don\'t reuse the token', id: 'token_expired · logged_out · deactivated · password_reset: login lagi, jangan pakai token yang sama' }),
        ),
      ],
    },
  ],

  Examples: [
    {
      title: { en: 'Role-protected ping', id: 'Ping dengan batas role' },
      nodes: [
        start('GET /api/admin/ping · /api/tenant/ping'),
        ...auth(),
        check(
          { en: 'Role allowed? admin ping: superadmin, admin · role ping: all', id: 'Role diizinkan? admin ping: superadmin, admin · role ping: semua' },
          '403 Forbidden',
        ),
        end('200 { message }'),
      ],
    },
  ],
};

// ---------- SVG rendering ----------

const W = 480;
const MAIN_X = 8;
const MAIN_W = 224;
const GAP = 44;
const SIDE_X = MAIN_X + MAIN_W + GAP;
const SIDE_W = W - SIDE_X - 8;
const PAD_X = 12;
const PAD_Y = 9;
const LINE_H = 16;
const ROW_GAP = 30;
const SIDE_GAP = 8;
/** How far a check's pointed ends reach in. */
const POINT = 12;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Rough text width (12px Plus Jakarta Sans / 11px JetBrains Mono), good enough to wrap lines. */
function textWidth(s: string, code: boolean) {
  if (code) return s.length * 6.7;
  let w = 0;
  for (const ch of s) {
    if (ch === ' ') w += 3.4;
    else if (/[iljtf.,:;'|!()[\]·]/.test(ch)) w += 3.8;
    else if (/[mwMW@]/.test(ch)) w += 10;
    else if (/[A-Z0-9{}<>→]/.test(ch)) w += 8;
    else w += 6.6;
  }
  return w;
}

interface Word {
  s: string;
  code: boolean;
  /** Whether a space comes before it (none between a code span and the punctuation around it). */
  space: boolean;
}
/** Splits text into lines that fit `width`; `backticks` mark code. */
function wrap(text: string, width: number): Word[][] {
  const words: Word[] = [];
  let afterSpace = false;
  text.split(/(`[^`]+`)/).forEach((part) => {
    const code = part.startsWith('`') && part.endsWith('`') && part.length > 1;
    const body = code ? part.slice(1, -1) : part;
    body.split(/(\s+)/).forEach((s, i, all) => {
      if (/^\s*$/.test(s)) {
        if (s) afterSpace = true;
        return;
      }
      words.push({ s, code, space: afterSpace || (i > 0 && /\s/.test(all[i - 1])) });
      afterSpace = false;
    });
    if (/\s$/.test(body)) afterSpace = true;
  });
  const lines: Word[][] = [];
  let line: Word[] = [];
  let used = 0;
  for (const w of words) {
    const add = textWidth(w.s, w.code) + (line.length && w.space ? 3.4 : 0);
    if (line.length && w.space && used + add > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    used += line.length ? add : textWidth(w.s, w.code);
    line.push(w);
  }
  if (line.length) lines.push(line);
  return lines;
}

function textBlock(lines: Word[][], cx: number, top: number, cls: string) {
  return lines
    .map((line, i) => {
      const spans = line.map((w, j) => `${j && w.space ? ' ' : ''}${w.code ? `<tspan class="fc-code">${esc(w.s)}</tspan>` : esc(w.s)}`).join('');
      return `<text class="${cls}" x="${cx}" y="${top + PAD_Y + 12 + i * LINE_H}" text-anchor="middle">${spans}</text>`;
    })
    .join('');
}

const boxHeight = (lines: number) => lines * LINE_H + PAD_Y * 2 - 2;

let chartCount = 0;

function renderChart(chart: Chart, lang: Lang) {
  const markerId = `fc-arrow-${++chartCount}`;
  const parts: string[] = [];
  let y = 8;
  let prevBottom: number | null = null;
  let prevWasCheck = false;
  const cx = MAIN_X + MAIN_W / 2;

  for (const node of chart.nodes) {
    const inner = MAIN_W - PAD_X * 2 - (node.kind === 'check' ? POINT * 2 : 0);
    const lines = wrap(pick(node.text, lang), inner);
    const h = boxHeight(lines.length);
    const sides = (node.side ?? []).map((s) => {
      const sl = wrap(pick(s.text, lang), SIDE_W - PAD_X * 2);
      return { ...s, lines: sl, h: boxHeight(sl.length) };
    });
    const sidesH = sides.reduce((n, s) => n + s.h, 0) + Math.max(sides.length - 1, 0) * SIDE_GAP;
    const rowH = Math.max(h, sidesH);
    const top = y + (rowH - h) / 2;
    const midY = top + h / 2;

    // Arrow from the previous node down to this one
    if (prevBottom !== null) {
      parts.push(`<line class="fc-line" x1="${cx}" y1="${prevBottom}" x2="${cx}" y2="${top - 1}" marker-end="url(#${markerId})"/>`);
      if (prevWasCheck) parts.push(`<text class="fc-label" x="${cx + 6}" y="${(prevBottom + top) / 2 + 4}">${esc(pick(YES, lang))}</text>`);
    }

    // The node itself
    const x = MAIN_X;
    if (node.kind === 'check') {
      const pts = [
        [x + POINT, top], [x + MAIN_W - POINT, top], [x + MAIN_W, midY],
        [x + MAIN_W - POINT, top + h], [x + POINT, top + h], [x, midY],
      ];
      parts.push(`<polygon class="fc-box fc-check" points="${pts.map((p) => p.join(',')).join(' ')}"/>`);
    } else {
      const rx = node.kind === 'step' ? 8 : h / 2;
      parts.push(`<rect class="fc-box fc-${node.kind}" x="${x}" y="${top}" width="${MAIN_W}" height="${h}" rx="${Math.min(rx, 18)}"/>`);
    }
    parts.push(textBlock(lines, cx, top, `fc-text fc-text-${node.kind}`));

    // Boxes on the right, joined to the node's right edge
    let sy = y + (rowH - sidesH) / 2;
    for (const s of sides) {
      const sMid = sy + s.h / 2;
      const x1 = MAIN_X + MAIN_W;
      const elbow = MAIN_X + MAIN_W + GAP / 2;
      const d = Math.abs(sMid - midY) < 1 ? `M${x1},${midY} H${SIDE_X - 1}` : `M${x1},${midY} H${elbow} V${sMid} H${SIDE_X - 1}`;
      const arrow = s.kind === 'note' ? '' : ` marker-end="url(#${markerId})"`;
      parts.push(`<path class="fc-line fc-line-${s.kind}" d="${d}" fill="none"${arrow}/>`);
      if (s.label) parts.push(`<text class="fc-label" x="${x1 + 5}" y="${midY - 5}">${esc(pick(s.label, lang))}</text>`);
      parts.push(`<rect class="fc-box fc-${s.kind}" x="${SIDE_X}" y="${sy}" width="${SIDE_W}" height="${s.h}" rx="8"/>`);
      parts.push(textBlock(s.lines, SIDE_X + SIDE_W / 2, sy, `fc-text fc-text-${s.kind}`));
      sy += s.h + SIDE_GAP;
    }

    prevBottom = top + h;
    prevWasCheck = node.kind === 'check';
    y += rowH + ROW_GAP;
  }

  const height = Math.ceil(y - ROW_GAP + 8);
  const title = esc(pick(chart.title, lang));
  return `<figure class="flow">
  <figcaption>${title}</figcaption>
  <svg class="fc" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${title}">
    <defs><marker id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="fc-arrowhead" d="M0,0 L10,5 L0,10 z"/></marker></defs>
    ${parts.join('\n    ')}
  </svg>
</figure>`;
}

/** The flowcharts of one Postman folder in one language, or null when the folder has none. */
export function renderFlows(folder: string, lang: Lang): string | null {
  const charts = FLOWS[folder];
  if (!charts?.length) return null;
  return charts.map((c) => renderChart(c, lang)).join('\n');
}
