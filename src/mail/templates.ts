/**
 * Email templates (Bahasa Indonesia). Each returns the subject, an HTML body and a plain-text body.
 * HTML uses inline styles and tables only, which is what email clients reliably support.
 */
import type { MailMessage } from '../services/mail.service';

const ROLE_NAMES: Record<string, string> = {
  superadmin: 'Superadmin',
  disnakertrans: 'Disnakertrans',
  admin: 'Admin',
  tenant: 'Tenant',
};

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e8f0;">
        <tr><td style="background:#4f46e5;background-image:linear-gradient(120deg,#4338ca,#7c3aed 45%,#db2777);padding:28px 32px;color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Prafi</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px;">${escape(title)}</div>
        </td></tr>
        <tr><td style="padding:28px 32px;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e4e8f0;font-size:12px;color:#64748b;">
          Email ini dikirim otomatis oleh sistem Prafi, mohon tidak membalas email ini.
          Jika Anda tidak merasa mendaftar atau tidak mengenali akun ini, abaikan email ini.
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

/** To a disnakertrans account created by a superadmin: the account exists, click the link to activate the email. */
export function disnakertransAccountCreated(user: Recipient, link: string, validHours: number): Omit<MailMessage, 'to'> {
  const name = `${user.firstName} ${user.lastName}`;
  const subject = 'Akun Disnakertrans Anda telah dibuat';
  const html = layout(
    subject,
    `<p>Halo <strong>${escape(name)}</strong>,</p>
     <p>Akun Anda dengan peran <strong>${ROLE_NAMES[user.role] ?? user.role}</strong> telah dibuat oleh Superadmin di sistem Prafi menggunakan email <strong>${escape(user.email)}</strong>.</p>
     <p>Sebelum dapat menggunakan sistem, aktifkan email Anda dengan menekan tombol berikut:</p>
     <p style="text-align:center;margin:28px 0;">
       <a href="${escape(link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px;">Aktifkan Email</a>
     </p>
     <p style="font-size:13px;color:#64748b;">Atau salin tautan ini ke browser Anda:<br><a href="${escape(link)}" style="color:#4f46e5;word-break:break-all;">${escape(link)}</a></p>
     <p>Tautan ini berlaku selama <strong>${validHours} jam</strong>. Kata sandi untuk masuk akan diberikan langsung oleh Superadmin.</p>
     <p>Terima kasih,<br>Tim Prafi</p>`,
  );
  const text = [
    `Halo ${name},`,
    '',
    `Akun Anda dengan peran ${ROLE_NAMES[user.role] ?? user.role} telah dibuat oleh Superadmin di sistem Prafi menggunakan email ${user.email}.`,
    'Sebelum dapat menggunakan sistem, aktifkan email Anda melalui tautan berikut:',
    link,
    '',
    `Tautan ini berlaku selama ${validHours} jam. Kata sandi untuk masuk akan diberikan langsung oleh Superadmin.`,
    '',
    'Terima kasih,',
    'Tim Prafi',
  ].join('\n');
  return { subject, html, text };
}

/** To a self-registered admin or tenant: the account exists, confirm the email with this OTP. */
export function accountCreatedOtp(user: Recipient, code: string, validMinutes: number, resent = false): Omit<MailMessage, 'to'> {
  const name = `${user.firstName} ${user.lastName}`;
  const subject = resent ? `Kode OTP baru Anda: ${code}` : `Akun Prafi Anda telah dibuat - kode OTP ${code}`;
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
         : `<p>Akun <strong>${role}</strong> Anda di sistem Prafi telah berhasil dibuat dengan email <strong>${escape(user.email)}</strong>.</p>
            <p>Untuk memastikan email ini aktif, masukkan kode OTP berikut:</p>`
     }
     <p style="text-align:center;margin:26px 0;">
       <span style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;background:#eef2ff;color:#4338ca;padding:14px 22px;border-radius:12px;">${escape(code)}</span>
     </p>
     <p>Kode ini berlaku selama <strong>${validMinutes} menit</strong>. Jangan berikan kode ini kepada siapa pun.</p>
     ${waitForApproval}
     <p>Terima kasih,<br>Tim Prafi</p>`,
  );
  const text = [
    `Halo ${name},`,
    '',
    resent
      ? 'Berikut kode OTP baru untuk memverifikasi email Anda. Kode sebelumnya sudah tidak berlaku.'
      : `Akun ${role} Anda di sistem Prafi telah berhasil dibuat dengan email ${user.email}.\nUntuk memastikan email ini aktif, masukkan kode OTP berikut:`,
    '',
    `Kode OTP: ${code}`,
    '',
    `Kode ini berlaku selama ${validMinutes} menit. Jangan berikan kode ini kepada siapa pun.`,
    ...(user.role === 'admin' ? ['Setelah email terverifikasi, akun Admin Anda masih perlu diaktifkan oleh Disnakertrans sebelum dapat digunakan.'] : []),
    '',
    'Terima kasih,',
    'Tim Prafi',
  ].join('\n');
  return { subject, html, text };
}

/** Forgot password: a link to the frontend's reset page. */
export function passwordResetRequested(user: Recipient, link: string, validMinutes: number): Omit<MailMessage, 'to'> {
  const name = `${user.firstName} ${user.lastName}`;
  const subject = 'Permintaan atur ulang kata sandi akun Prafi';
  const html = layout(
    'Atur ulang kata sandi',
    `<p>Halo <strong>${escape(name)}</strong>,</p>
     <p>Kami menerima permintaan untuk mengatur ulang kata sandi akun Prafi Anda dengan email <strong>${escape(user.email)}</strong>.</p>
     <p>Tekan tombol berikut untuk membuat kata sandi baru:</p>
     <p style="text-align:center;margin:28px 0;">
       <a href="${escape(link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px;">Atur Ulang Kata Sandi</a>
     </p>
     <p style="font-size:13px;color:#64748b;">Atau salin tautan ini ke browser Anda:<br><a href="${escape(link)}" style="color:#4f46e5;word-break:break-all;">${escape(link)}</a></p>
     <p>Tautan ini berlaku selama <strong>${validMinutes} menit</strong> dan hanya dapat digunakan satu kali. Setelah kata sandi diubah, semua sesi login Anda akan diakhiri.</p>
     <p>Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini. Kata sandi Anda tidak akan berubah.</p>
     <p>Terima kasih,<br>Tim Prafi</p>`,
  );
  const text = [
    `Halo ${name},`,
    '',
    `Kami menerima permintaan untuk mengatur ulang kata sandi akun Prafi Anda dengan email ${user.email}.`,
    'Buka tautan berikut untuk membuat kata sandi baru:',
    link,
    '',
    `Tautan ini berlaku selama ${validMinutes} menit dan hanya dapat digunakan satu kali. Setelah kata sandi diubah, semua sesi login Anda akan diakhiri.`,
    'Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini. Kata sandi Anda tidak akan berubah.',
    '',
    'Terima kasih,',
    'Tim Prafi',
  ].join('\n');
  return { subject, html, text };
}

/** Browser page shown after clicking the activation link. */
export function verificationResultPage(ok: boolean, message: string) {
  return layout(
    ok ? 'Email berhasil diaktifkan' : 'Aktivasi email gagal',
    `<p style="font-size:40px;margin:0 0 8px;">${ok ? '✅' : '⚠️'}</p>
     <p>${escape(message)}</p>
     ${ok ? '<p>Anda sekarang dapat masuk ke sistem Prafi menggunakan email dan kata sandi Anda.</p>' : ''}`,
  ).replace('Email ini dikirim otomatis oleh sistem Prafi, mohon tidak membalas email ini.\n          Jika Anda tidak merasa mendaftar atau tidak mengenali akun ini, abaikan email ini.', 'Sistem Prafi');
}
