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
  const path =
    job.event === 'identity.verify-email'
      ? '/verify-email'
      : job.event === 'identity.password-reset'
        ? '/forgot-password'
        : 'invitationId' in job
          ? `/reviewer/invitations/${job.invitationId}`
          : 'assignmentId' in job && job.event === 'peer-review.due-reminder'
            ? `/reviewer/assignments/${job.assignmentId}`
            : 'assignmentId' in job
              ? '/editorial'
              : 'submissionId' in job &&
                  ['editorial.assignment-created', 'editorial.revision-submitted'].includes(
                    job.event,
                  )
                ? `/editorial/submissions/${job.submissionId}`
                : 'submissionId' in job &&
                    [
                      'production.assignment-created',
                      'production.query-opened',
                      'publication.scheduled',
                      'publication.published',
                    ].includes(job.event)
                  ? `/production/submissions/${job.submissionId}`
                  : 'submissionId' in job
                    ? `/workspace/submissions/${job.submissionId}`
                    : '/';
  const url = new URL(path, `${appBaseUrl.replace(/\/$/, '')}/`);
  if ('token' in job) url.searchParams.set('token', job.token);
  return url.toString();
}

export function renderTransactionalEmail(
  job: TransactionalEmailJob,
  appBaseUrl: string,
  from: string,
): RenderedEmail {
  const url = actionUrl(job, appBaseUrl);
  const content = {
    'identity.verify-email': {
      subject: 'Verifikasi email akun Aksara',
      instruction: 'Gunakan tautan berikut untuk memverifikasi email akun Anda:',
      footer:
        'Tautan berlaku selama 24 jam. Abaikan email ini jika Anda tidak membuat permintaan tersebut.',
    },
    'identity.password-reset': {
      subject: 'Reset password akun Aksara',
      instruction: 'Gunakan tautan berikut untuk membuat password baru:',
      footer:
        'Tautan berlaku selama 1 jam. Abaikan email ini jika Anda tidak membuat permintaan tersebut.',
    },
    'editorial.pre-review-correction': {
      subject: 'Perbaikan pra-review diperlukan',
      instruction: 'Tim editorial meminta perbaikan sebelum naskah dapat diproses lebih lanjut:',
      footer: 'Buka workspace untuk melihat rincian perubahan yang diminta.',
    },
    'editorial.desk-rejected': {
      subject: 'Keputusan screening editorial tersedia',
      instruction: 'Keputusan screening untuk submission Anda telah tersedia:',
      footer: 'Buka workspace untuk membaca surat keputusan.',
    },
    'editorial.assignment-created': {
      subject: 'Assignment editorial baru',
      instruction: 'Sebuah submission telah ditugaskan ke workspace editorial Anda:',
      footer: 'Buka workspace editorial untuk meninjau assignment.',
    },
    'editorial.decision-released': {
      subject: 'Keputusan editorial tersedia',
      instruction: 'Tim editorial telah merilis keputusan untuk submission Anda:',
      footer: 'Buka workspace untuk membaca surat dan komentar review yang dipilih editor.',
    },
    'editorial.revision-submitted': {
      subject: 'Revisi naskah telah dikirim',
      instruction: 'Author telah mengirim versi revisi untuk submission yang Anda tangani:',
      footer:
        'Buka workspace editorial untuk memilih evaluasi editor atau round review berikutnya.',
    },
    'editorial.revision-reminder': {
      subject: 'Pengingat tenggat revisi',
      instruction: 'Tenggat revisi submission Anda semakin dekat:',
      footer: 'Buka workspace untuk menyelesaikan tanggapan dan file revisi.',
    },
    'peer-review.invited': {
      subject: 'Undangan peer review',
      instruction: 'Anda menerima undangan untuk menilai sebuah naskah:',
      footer:
        'Masuk dengan akun yang diundang, deklarasikan konflik, lalu terima atau tolak sebelum batas respons.',
    },
    'peer-review.invitation-reminder': {
      subject: 'Pengingat undangan peer review',
      instruction: 'Undangan peer review Anda masih menunggu respons:',
      footer: 'Tautan undangan bersifat pribadi dan akan kedaluwarsa pada batas respons.',
    },
    'peer-review.due-reminder': {
      subject: 'Pengingat tenggat peer review',
      instruction: 'Tenggat review assignment Anda semakin dekat:',
      footer: 'Buka workspace reviewer untuk menyimpan atau mengirim review.',
    },
    'peer-review.responded': {
      subject: 'Respons undangan reviewer tersedia',
      instruction: 'Seorang reviewer telah merespons undangan peer review:',
      footer: 'Buka workspace editorial untuk melihat status tanpa membuka konten rahasia.',
    },
    'peer-review.submitted': {
      subject: 'Peer review telah dikirim',
      instruction: 'Sebuah peer review telah selesai dan tersedia bagi editor:',
      footer: 'Buka workspace editorial untuk meninjau rekomendasi dan konten review.',
    },
    'production.assignment-created': {
      subject: 'Assignment produksi baru',
      instruction: 'Sebuah submission telah ditugaskan ke workspace produksi Anda:',
      footer: 'Buka workspace produksi untuk melihat stage dan file sumber yang diizinkan.',
    },
    'production.query-opened': {
      subject: 'Query copyediting memerlukan jawaban',
      instruction: 'Tim produksi mengirim query untuk submission Anda:',
      footer: 'Buka proses produksi untuk membaca dan menjawab query.',
    },
    'publication.scheduled': {
      subject: 'Publikasi telah dijadwalkan',
      instruction: 'Submission Anda telah dijadwalkan untuk publikasi:',
      footer: 'Buka proses produksi untuk melihat status dan jadwal.',
    },
    'publication.published': {
      subject: 'Artikel telah dipublikasikan',
      instruction: 'Artikel Anda telah dipublikasikan:',
      footer: 'Buka proses produksi untuk menuju rekam publik artikel.',
    },
  }[job.event];

  return {
    from,
    to: job.recipient,
    subject: content.subject,
    text: `${content.instruction}\n\n${url}\n\n${content.footer}`,
    html: `<p>${content.instruction}</p><p><a href='${escapeHtml(url)}'>Buka Aksara</a></p><p>${content.footer}</p>`,
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
    ('token' in job && job.token.length < 32) ||
    ('submissionId' in job && !job.submissionId) ||
    ('invitationId' in job && !job.invitationId) ||
    ('assignmentId' in job && !job.assignmentId) ||
    !job.userId ||
    !job.requestId
  ) {
    throw new Error('Transactional email job payload is invalid.');
  }
  return transport.sendMail(renderTransactionalEmail(job, appBaseUrl, from));
}
