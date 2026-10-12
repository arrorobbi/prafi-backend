/**
 * Email templates (Bahasa Indonesia). Each returns the subject, an HTML body and a plain-text body.
 * HTML uses inline styles and tables only, which is what email clients reliably support.
 * The look follows the Transniaga landing page: logo + orange/navy brand on white, a navy "about" block and an
 * orange link bar at the bottom, orange pill buttons, Poppins (falls back to Arial where web fonts don't load).
 */
import { env } from '../config/env';
import type { MailMessage } from '../services/mail.service';

const BRAND = 'Trans Niaga';
const TAGLINE = 'Produk Pilihan Ada Disini';
const PLACE = 'Kawasan Transmigrasi Prafi, Manokwari';

// The landing page's colors (frontend globals.css)
const NAVY = '#0e3c69';
const ORANGE = '#ea7b25';
const ORANGE_SOFT = '#fdf1e7';
const TEXT = '#1b1b1b';
const MUTED = '#6b7280';
const PAGE_BG = '#f4f5f7';
const FONT = "Poppins,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Served by the frontend, so emails show the same logo as the site. */
export const LOGO_URL = `${env.frontendUrl}/logo.png`;

const ROLE_NAMES: Record<string, string> = {
  superadmin: 'Superadmin',
  disnakertrans: 'Disnakertrans',
  admin: 'Admin',
  tenant: 'Tenant',
};

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const button = (href: string, label: string) =>
  `<p style="text-align:center;margin:28px 0;">
       <a href="${escape(href)}" style="display:inline-block;background:${ORANGE};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 30px;border-radius:999px;">${label}</a>
     </p>`;

const copyLink = (href: string) =>
  `<p style="font-size:13px;color:${MUTED};">Atau salin tautan ini ke browser Anda:<br><a href="${escape(href)}" style="color:${ORANGE};word-break:break-all;">${escape(href)}</a></p>`;

const SIGN_OFF = `<p>Terima kasih,<br><strong style="color:${NAVY};">Tim ${BRAND}</strong></p>`;
const TEXT_SIGN_OFF = ['', 'Terima kasih,', `Tim ${BRAND}`, '', `${BRAND} · ${PLACE}`, env.frontendUrl];

const AUTO_NOTICE =
  `Email ini dikirim otomatis oleh sistem ${BRAND}, mohon tidak membalas email ini. ` +
  'Jika Anda tidak merasa mendaftar atau tidak mengenali akun ini, abaikan email ini.';

function layout(title: string, bodyHtml: string) {
  const site = escape(env.frontendUrl);
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · ${BRAND}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT};color:${TEXT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 14px 30px rgba(14,60,105,0.12);">
        <tr><td style="padding:22px 32px;border-bottom:3px solid ${ORANGE};">
          <a href="${site}" style="text-decoration:none;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:12px;"><img src="${escape(LOGO_URL)}" width="56" height="56" alt="${BRAND}" style="display:block;border:0;"></td>
              <td>
                <div style="font-size:24px;font-weight:700;line-height:1.05;color:${ORANGE};font-family:${FONT};">${BRAND.toUpperCase()}</div>
                <div style="font-size:12px;font-weight:500;color:${NAVY};font-family:${FONT};">${TAGLINE}</div>
              </td>
            </tr></table>
          </a>
        </td></tr>
        <tr><td style="padding:28px 32px 4px;">
          <div style="font-size:21px;font-weight:700;color:${NAVY};">${escape(title)}</div>
        </td></tr>
        <tr><td style="padding:12px 32px 28px;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="background:${NAVY};color:#ffffff;padding:22px 32px;font-size:13px;line-height:1.6;">
          <strong>UMKM ${BRAND.toUpperCase()}</strong> adalah direktori dan marketplace UMKM ${PLACE}, dibangun dari semangat gotong royong untuk memajukan perekonomian lokal.
          <div style="margin-top:10px;font-size:12px;opacity:.8;">${AUTO_NOTICE}</div>
        </td></tr>
        <tr><td style="background:${ORANGE};color:#ffffff;padding:14px 32px;font-size:12px;">
          <a href="${site}/produk" style="color:#ffffff;font-weight:600;text-decoration:none;">Produk</a> &nbsp;·&nbsp;
          <a href="${site}/umkm" style="color:#ffffff;font-weight:600;text-decoration:none;">UMKM</a> &nbsp;·&nbsp;
          <a href="${site}/panduan" style="color:#ffffff;font-weight:600;text-decoration:none;">Panduan</a>
          <div style="margin-top:6px;">© ${year} ${BRAND} · ${PLACE}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

interface Recipient {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

/**
 * To a disnakertrans account created by a superadmin: the account exists; the button opens the activation page,
 * where the temporary password from this email is replaced by one the person chooses. `resent`: a new email asked
 * for later (its temporary password replaces the earlier one).
 */
export function disnakertransAccountCreated(
  user: Recipient,
  link: string,
  temporaryPassword: string,
  validHours: number,
  resent = false,
): Omit<MailMessage, 'to'> {
  const name = `${user.firstName} ${user.lastName}`;
  const role = ROLE_NAMES[user.role] ?? user.role;
  const subject = resent ? `Email aktivasi baru akun Disnakertrans ${BRAND} Anda` : `Akun Disnakertrans ${BRAND} Anda telah dibuat`;
  const intro = resent
    ? `Berikut email aktivasi baru untuk akun ${role} Anda di ${BRAND} (${user.email}). Tautan dan kata sandi sementara pada email sebelumnya tidak berlaku lagi.`
    : `Akun Anda dengan peran ${role} telah dibuat oleh Superadmin di ${BRAND} menggunakan email ${user.email}.`;
  const html = layout(
    resent ? 'Email aktivasi baru' : 'Akun Anda telah dibuat',
    `<p>Halo <strong>${escape(name)}</strong>,</p>
     <p>${
       resent
         ? `Berikut email aktivasi baru untuk akun <strong>${role}</strong> Anda di ${BRAND} (<strong>${escape(user.email)}</strong>). Tautan dan kata sandi sementara pada email sebelumnya tidak berlaku lagi.`
         : `Akun Anda dengan peran <strong>${role}</strong> telah dibuat oleh Superadmin di ${BRAND} menggunakan email <strong>${escape(user.email)}</strong>.`
     }</p>
     <p>Kata sandi sementara Anda:</p>
     <p style="text-align:center;margin:20px 0;">
       <span style="display:inline-block;background:${ORANGE_SOFT};border:1px dashed ${ORANGE};border-radius:12px;padding:12px 26px;font-size:26px;font-weight:700;letter-spacing:2px;color:${NAVY};font-family:'Courier New',Courier,monospace;">${escape(temporaryPassword)}</span>
     </p>
     <p>Untuk mengaktifkan akun, tekan tombol berikut, masukkan kata sandi sementara di atas, lalu buat kata sandi baru Anda sendiri:</p>
     ${button(link, 'Aktifkan Akun &amp; Buat Kata Sandi')}
     ${copyLink(link)}
     <p>Tautan dan kata sandi sementara ini berlaku selama <strong>${validHours} jam</strong>. Kata sandi sementara tidak dapat dipakai untuk masuk: akun baru dapat digunakan setelah Anda membuat kata sandi baru.</p>
     ${SIGN_OFF}`,
  );
  const text = [
    `Halo ${name},`,
    '',
    intro,
    '',
    `Kata sandi sementara Anda: ${temporaryPassword}`,
    '',
    'Untuk mengaktifkan akun, buka tautan berikut, masukkan kata sandi sementara di atas, lalu buat kata sandi baru Anda sendiri:',
    link,
    '',
    `Tautan dan kata sandi sementara ini berlaku selama ${validHours} jam. Kata sandi sementara tidak dapat dipakai untuk masuk: akun baru dapat digunakan setelah Anda membuat kata sandi baru.`,
    ...TEXT_SIGN_OFF,
  ].join('\n');
  return { subject, html, text };
}

/** To a self-registered admin or tenant: the account exists, confirm the email with this OTP. */
export function accountCreatedOtp(user: Recipient, code: string, validMinutes: number, resent = false): Omit<MailMessage, 'to'> {
  const name = `${user.firstName} ${user.lastName}`;
  const subject = resent ? `Kode OTP baru ${BRAND} Anda: ${code}` : `Akun ${BRAND} Anda telah dibuat - kode OTP ${code}`;
  const role = ROLE_NAMES[user.role] ?? user.role;
  const waitForApproval =
    user.role === 'admin'
      ? '<p>Setelah email terverifikasi, akun Admin Anda masih perlu diaktifkan oleh Disnakertrans sebelum dapat digunakan.</p>'
      : '';
  const html = layout(
    resent ? 'Kode OTP baru' : 'Akun Anda telah dibuat',
    `<p>Halo <strong>${escape(name)}</strong>,</p>
     ${
       resent
         ? '<p>Berikut kode OTP baru untuk memverifikasi email Anda. Kode sebelumnya sudah tidak berlaku.</p>'
         : `<p>Akun <strong>${role}</strong> Anda di ${BRAND} telah berhasil dibuat dengan email <strong>${escape(user.email)}</strong>.</p>
            <p>Untuk memastikan email ini aktif, masukkan kode OTP berikut:</p>`
     }
     <p style="text-align:center;margin:26px 0;">
       <span style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;background:${ORANGE_SOFT};color:${NAVY};border:2px dashed ${ORANGE};padding:14px 22px;border-radius:14px;">${escape(code)}</span>
     </p>
     <p>Kode ini berlaku selama <strong>${validMinutes} menit</strong>. Jangan berikan kode ini kepada siapa pun.</p>
     ${waitForApproval}
     ${SIGN_OFF}`,
  );
  const text = [
    `Halo ${name},`,
    '',
    resent
      ? 'Berikut kode OTP baru untuk memverifikasi email Anda. Kode sebelumnya sudah tidak berlaku.'
      : `Akun ${role} Anda di ${BRAND} telah berhasil dibuat dengan email ${user.email}.\nUntuk memastikan email ini aktif, masukkan kode OTP berikut:`,
    '',
    `Kode OTP: ${code}`,
    '',
    `Kode ini berlaku selama ${validMinutes} menit. Jangan berikan kode ini kepada siapa pun.`,
    ...(user.role === 'admin' ? ['Setelah email terverifikasi, akun Admin Anda masih perlu diaktifkan oleh Disnakertrans sebelum dapat digunakan.'] : []),
    ...TEXT_SIGN_OFF,
  ].join('\n');
  return { subject, html, text };
}

/**
 * To a self-registered admin whose account a disnakertrans has just activated: they can log in now.
 * `note`: the reason the disnakertrans typed, if any. `emailVerified` false: the OTP step is still to be done first.
 */
export function adminAccountActivated(
  user: Recipient,
  { note, emailVerified }: { note?: string | null; emailVerified: boolean },
): Omit<MailMessage, 'to'> {
  const name = `${user.firstName} ${user.lastName}`;
  const loginUrl = `${env.frontendUrl}/login`;
  const subject = `Akun Admin ${BRAND} Anda telah diaktifkan`;
  const tasks = ['Mengonfirmasi produk yang diajukan penjual', 'Mengaktifkan akun penjual (UMKM)', 'Mengelola kategori produk'];
  const html = layout(
    'Akun Anda telah diaktifkan',
    `<p>Halo <strong>${escape(name)}</strong>,</p>
     <p>Kabar baik! Akun <strong>Admin</strong> Anda di ${BRAND} dengan email <strong>${escape(user.email)}</strong> telah <strong style="color:${ORANGE};">diaktifkan oleh Disnakertrans</strong>.</p>
     ${
       note
         ? `<p style="margin:18px 0;padding:12px 16px;background:${ORANGE_SOFT};border-left:4px solid ${ORANGE};border-radius:8px;"><strong>Catatan dari Disnakertrans:</strong><br>${escape(note)}</p>`
         : ''
     }
     ${
       emailVerified
         ? '<p>Sekarang Anda sudah dapat masuk dan menggunakan dashboard administrator:</p>'
         : '<p>Satu langkah lagi: selesaikan verifikasi email Anda dengan kode OTP yang telah kami kirim saat pendaftaran (atau minta kode baru di halaman masuk), lalu Anda dapat menggunakan dashboard administrator:</p>'
     }
     <ul style="margin:8px 0 0;padding-left:20px;">${tasks.map((t) => `<li>${t}</li>`).join('')}</ul>
     ${button(loginUrl, 'Masuk ke Trans Niaga')}
     <p>Masuk menggunakan email dan kata sandi yang Anda buat saat mendaftar. Lupa kata sandi? Gunakan <em>Lupa Password</em> di halaman masuk.</p>
     ${SIGN_OFF}`,
  );
  const text = [
    `Halo ${name},`,
    '',
    `Kabar baik! Akun Admin Anda di ${BRAND} dengan email ${user.email} telah diaktifkan oleh Disnakertrans.`,
    ...(note ? ['', `Catatan dari Disnakertrans: ${note}`] : []),
    '',
    emailVerified
      ? 'Sekarang Anda sudah dapat masuk dan menggunakan dashboard administrator:'
      : 'Satu langkah lagi: selesaikan verifikasi email Anda dengan kode OTP yang telah kami kirim saat pendaftaran (atau minta kode baru di halaman masuk), lalu Anda dapat menggunakan dashboard administrator:',
    ...tasks.map((t) => `- ${t}`),
    '',
    `Masuk: ${loginUrl}`,
    'Masuk menggunakan email dan kata sandi yang Anda buat saat mendaftar. Lupa kata sandi? Gunakan "Lupa Password" di halaman masuk.',
    ...TEXT_SIGN_OFF,
  ].join('\n');
  return { subject, html, text };
}

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/**
 * To the site's own mailbox: the weekly backup, attached (the copy kept off the server). A backup too large for one
 * email comes as several (`part` of `parts`); files over the limit are cut into numbered parts (`splitFiles`).
 */
export function backupReady(b: {
  at: Date;
  database: { file: string; bytes: number };
  images: { file: string; bytes: number } | null;
  keep: number;
  dir: string;
  /** This email's number and the total (1 of 1 when everything fits one email) */
  part: number;
  parts: number;
  /** What is attached to this email */
  attached: { name: string; bytes: number }[];
  /** Names of the backup files that were cut into parts (empty when none) */
  splitFiles: string[];
}): Omit<MailMessage, 'to'> {
  const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(b.at);
  const name = (file: string) => file.split('/').pop()!;
  const many = b.parts > 1;
  const subject =
    `Backup mingguan ${BRAND} - ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(b.at)}` +
    (many ? ` (bagian ${b.part} dari ${b.parts})` : '');
  const imagesText = !b.images
    ? 'Arsip gambar gagal dibuat; periksa log server.'
    : `${name(b.images.file)} (${sizeOf(b.images.bytes)}): semua foto yang diunggah (produk, logo, profil, kategori).`;
  const joinCommands = b.splitFiles.map((f) => `cat ${f}.part* > ${f}`);
  const manyText = many
    ? `Backup ini terlalu besar untuk satu email, sehingga dikirim dalam ${b.parts} email. Ini bagian ${b.part} dari ${b.parts}: simpan semuanya.`
    : '';
  const splitText = b.splitFiles.length
    ? 'File yang terlalu besar dipotong menjadi beberapa bagian (.part01, .part02, ...). Untuk menyatukannya kembali, unduh semua bagian ke satu folder lalu jalankan:'
    : '';
  const html = layout(
    many ? `Backup mingguan (bagian ${b.part} dari ${b.parts})` : 'Backup mingguan',
    `<p>Backup otomatis ${BRAND} telah dibuat pada <strong>${escape(date)} WIB</strong>.</p>
     ${many ? `<p style="margin:14px 0;padding:10px 16px;background:${ORANGE_SOFT};border-left:4px solid ${ORANGE};border-radius:8px;">${escape(manyText)}</p>` : ''}
     <p style="margin-bottom:4px;"><strong>Isi backup:</strong></p>
     <ul style="margin:0 0 12px;padding-left:20px;">
       <li><strong>${escape(name(b.database.file))}</strong> (${sizeOf(b.database.bytes)}): seluruh isi database.</li>
       <li>${escape(imagesText)}</li>
     </ul>
     <p style="margin-bottom:4px;"><strong>Lampiran email ini:</strong></p>
     <ul style="margin:0 0 12px;padding-left:20px;">${b.attached.map((f) => `<li>${escape(f.name)} (${sizeOf(f.bytes)})</li>`).join('')}</ul>
     ${
       b.splitFiles.length
         ? `<p>${escape(splitText)}</p>
            <pre style="margin:8px 0 14px;padding:10px 14px;background:#f4f5f7;border-radius:8px;font-family:Consolas,Menlo,monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;">${escape(joinCommands.join('\n'))}</pre>`
         : ''
     }
     <p>File yang sama (utuh) tersimpan di server pada <code>${escape(b.dir)}</code> (${b.keep} backup terakhir disimpan, yang lebih lama dihapus otomatis).</p>
     <p style="margin:18px 0;padding:12px 16px;background:${ORANGE_SOFT};border-left:4px solid ${ORANGE};border-radius:8px;">
       <strong>Simpan email ini.</strong> Lampiran berisi data akun dan data UMKM: jangan diteruskan ke orang lain.
       Cara memulihkan data ada di Panduan Server (bagian Database).
     </p>
     ${SIGN_OFF}`,
  );
  const text = [
    `Backup otomatis ${BRAND} telah dibuat pada ${date} WIB.`,
    ...(many ? ['', manyText] : []),
    '',
    'Isi backup:',
    `- ${name(b.database.file)} (${sizeOf(b.database.bytes)}): seluruh isi database.`,
    `- ${imagesText}`,
    '',
    'Lampiran email ini:',
    ...b.attached.map((f) => `- ${f.name} (${sizeOf(f.bytes)})`),
    ...(b.splitFiles.length ? ['', splitText, ...joinCommands.map((c) => `  ${c}`)] : []),
    '',
    `File yang sama (utuh) tersimpan di server pada ${b.dir} (${b.keep} backup terakhir disimpan).`,
    'Simpan email ini. Lampiran berisi data akun dan data UMKM: jangan diteruskan ke orang lain.',
    'Cara memulihkan data ada di Panduan Server (bagian Database).',
    ...TEXT_SIGN_OFF,
  ].join('\n');
  return { subject, html, text };
}

/** Forgot password: a link to the frontend's reset page. */
export function passwordResetRequested(user: Recipient, link: string, validMinutes: number): Omit<MailMessage, 'to'> {
  const name = `${user.firstName} ${user.lastName}`;
  const subject = `Permintaan atur ulang kata sandi akun ${BRAND}`;
  const html = layout(
    'Atur ulang kata sandi',
    `<p>Halo <strong>${escape(name)}</strong>,</p>
     <p>Kami menerima permintaan untuk mengatur ulang kata sandi akun ${BRAND} Anda dengan email <strong>${escape(user.email)}</strong>.</p>
     <p>Tekan tombol berikut untuk membuat kata sandi baru:</p>
     ${button(link, 'Atur Ulang Kata Sandi')}
     ${copyLink(link)}
     <p>Tautan ini berlaku selama <strong>${validMinutes} menit</strong> dan hanya dapat digunakan satu kali. Setelah kata sandi diubah, semua sesi login Anda akan diakhiri.</p>
     <p>Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini. Kata sandi Anda tidak akan berubah.</p>
     ${SIGN_OFF}`,
  );
  const text = [
    `Halo ${name},`,
    '',
    `Kami menerima permintaan untuk mengatur ulang kata sandi akun ${BRAND} Anda dengan email ${user.email}.`,
    'Buka tautan berikut untuk membuat kata sandi baru:',
    link,
    '',
    `Tautan ini berlaku selama ${validMinutes} menit dan hanya dapat digunakan satu kali. Setelah kata sandi diubah, semua sesi login Anda akan diakhiri.`,
    'Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini. Kata sandi Anda tidak akan berubah.',
    ...TEXT_SIGN_OFF,
  ].join('\n');
  return { subject, html, text };
}
