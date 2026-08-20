import { transactionalEmailEvents, type TransactionalEmailJob } from '@aksara/domain';
import type { Transporter } from 'nodemailer';

export interface RenderedEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(String.fromCharCode(34), '&quot;')
    .replaceAll(String.fromCharCode(39), '&#039;');
}

function actionUrl(job: TransactionalEmailJob, appBaseUrl: string): string {
  const path = job.event === 'identity.verify-email' ? '/verify-email' : '/forgot-password';
  const url = new URL(path, `${appBaseUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('token', job.token);
  return url.toString();
}

export function renderTransactionalEmail(
  job: TransactionalEmailJob,
  appBaseUrl: string,
  from: string,
): RenderedEmail {
  const url = actionUrl(job, appBaseUrl);
  const isVerification = job.event === 'identity.verify-email';
  const subject = isVerification ? 'Verifikasi email akun Aksara' : 'Reset password akun Aksara';
  const instruction = isVerification
    ? 'Gunakan tautan berikut untuk memverifikasi email akun Anda:'
    : 'Gunakan tautan berikut untuk membuat password baru:';
  const expiry = isVerification ? '24 jam' : '1 jam';

  return {
    from,
    to: job.recipient,
    subject,
    text: `${instruction}\n\n${url}\n\nTautan berlaku selama ${expiry}. Abaikan email ini jika Anda tidak membuat permintaan tersebut.`,
    html: `<p>${instruction}</p><p><a href='${escapeHtml(url)}'>Lanjutkan proses akun</a></p><p>Tautan berlaku selama ${expiry}. Abaikan email ini jika Anda tidak membuat permintaan tersebut.</p>`,
  };
}

export async function deliverTransactionalEmail(
  job: TransactionalEmailJob,
  appBaseUrl: string,
  from: string,
  transport: Pick<Transporter, 'sendMail'>,
) {
  if (
    !transactionalEmailEvents.includes(job.event) ||
    !job.recipient.includes('@') ||
    job.token.length < 32 ||
    !job.userId ||
    !job.requestId
  ) {
    throw new Error('Transactional email job payload is invalid.');
  }
  return transport.sendMail(renderTransactionalEmail(job, appBaseUrl, from));
}
