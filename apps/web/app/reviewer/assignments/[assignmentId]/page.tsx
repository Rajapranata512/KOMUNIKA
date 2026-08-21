import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { ReviewFileUploader } from './review-file-uploader';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface AssignmentDetail {
  id: string;
  dueAt: string;
  lockedAt: string | null;
  round: number;
  journal: { title: string; reviewModel: string };
  manuscript: {
    title: string;
    abstract: string;
    keywords: string[];
    authors?: Array<{ givenName: string; familyName: string; affiliation: string }>;
  };
  form: {
    name: string;
    version: number;
    questions: Array<{
      id: string;
      prompt: string;
      type: 'LONG_TEXT' | 'BOOLEAN' | 'RATING';
      required: boolean;
    }>;
  };
  response: {
    status: string;
    commentsToAuthor: string;
    confidentialComments: string;
    recommendation: string | null;
    answers: Array<{ questionId: string; value: string }>;
  } | null;
  files: Array<{ id: string; displayName: string; mime: string; size: number }>;
  reviewFiles: Array<{
    id: string;
    authorVisible: boolean;
    storedFile: { id: string; originalName: string; size: number; scanStatus: string };
  }>;
}

export default async function ReviewAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { assignmentId } = await params;
  const query = await searchParams;
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/reviews/assignments/${assignmentId}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Review assignment could not be loaded.');
  const detail = (await response.json()) as AssignmentDetail;
  const answers = new Map(
    detail.response?.answers.map(({ questionId, value }) => [questionId, value]),
  );
  const locked = detail.lockedAt || detail.response?.status === 'SUBMITTED';
  return (
    <main id={'main-content'} className={'editorial-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>
            {detail.journal.title} · Round {detail.round}
          </p>
          <h1>{detail.manuscript.title}</h1>
          <p>
            Tenggat {new Date(detail.dueAt).toLocaleString('id-ID')} · {detail.journal.reviewModel}
          </p>
        </div>
        <Link className={'secondary-button'} href={'/reviewer'}>
          Semua assignment
        </Link>
      </header>
      {query.result === 'error' ? (
        <p className={'form-error'} role={'alert'}>
          Review belum tersimpan. Lengkapi semua bidang wajib dan coba lagi.
        </p>
      ) : query.result ? (
        <p className={'form-success'} role={'status'}>
          {query.result === 'review-submit'
            ? 'Review final telah dikirim dan dikunci.'
            : 'Draf review tersimpan.'}
        </p>
      ) : null}
      <div className={'reviewer-workspace'}>
        <section className={'editorial-manuscript'}>
          <h2>{detail.manuscript.authors ? 'Naskah' : 'Naskah anonim'}</h2>
          <p className={'long-form-copy'}>{detail.manuscript.abstract}</p>
          <p>{detail.manuscript.keywords.join(' · ')}</p>
          {detail.manuscript.authors ? (
            <>
              <h3>Penulis</h3>
              <ul>
                {detail.manuscript.authors.map((author) => (
                  <li key={`${author.givenName}-${author.familyName}`}>
                    {author.givenName} {author.familyName} · {author.affiliation}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h3>File round ini</h3>
          <ul className={'file-list'}>
            {detail.files.map((file) => (
              <li key={file.id}>
                <div>
                  <strong>{file.displayName}</strong>
                  <small>
                    {file.mime} · {(file.size / 1024 / 1024).toFixed(2)} MB
                  </small>
                </div>
                <a href={`/auth/review-download?assignmentId=${detail.id}&fileId=${file.id}`}>
                  Unduh privat
                </a>
              </li>
            ))}
          </ul>
        </section>
        <form
          action={'/auth/review-action'}
          method={'post'}
          className={'review-form editorial-action-form'}
        >
          <input type={'hidden'} name={'assignmentId'} value={detail.id} />
          <h2>
            {detail.form.name} · v{detail.form.version}
          </h2>
          {detail.form.questions.map((question) => (
            <label key={question.id}>
              {question.prompt}
              {question.required ? ' *' : ''}
              {question.type === 'BOOLEAN' ? (
                <select
                  name={`answer:${question.id}`}
                  defaultValue={answers.get(question.id) ?? ''}
                  required={question.required}
                  disabled={Boolean(locked)}
                >
                  <option value={''}>Pilih</option>
                  <option value={'true'}>Ya</option>
                  <option value={'false'}>Tidak</option>
                </select>
              ) : question.type === 'RATING' ? (
                <input
                  name={`answer:${question.id}`}
                  type={'number'}
                  min={1}
                  max={5}
                  defaultValue={answers.get(question.id) ?? ''}
                  required={question.required}
                  disabled={Boolean(locked)}
                />
              ) : (
                <textarea
                  name={`answer:${question.id}`}
                  rows={5}
                  defaultValue={answers.get(question.id) ?? ''}
                  required={question.required}
                  disabled={Boolean(locked)}
                />
              )}
            </label>
          ))}
          <label>
            Komentar untuk author *
            <textarea
              name={'commentsToAuthor'}
              rows={8}
              minLength={20}
              defaultValue={detail.response?.commentsToAuthor}
              required
              disabled={Boolean(locked)}
            />
          </label>
          <label className={'confidential-field'}>
            Komentar rahasia untuk editor
            <textarea
              name={'confidentialComments'}
              rows={6}
              defaultValue={detail.response?.confidentialComments}
              disabled={Boolean(locked)}
            />
            <small>Tidak akan dirilis kepada author.</small>
          </label>
          <label>
            Rekomendasi *
            <select
              name={'recommendation'}
              defaultValue={detail.response?.recommendation ?? ''}
              required
              disabled={Boolean(locked)}
            >
              <option value={''}>Pilih rekomendasi</option>
              <option value={'ACCEPT'}>Accept</option>
              <option value={'MINOR_REVISION'}>Minor revision</option>
              <option value={'MAJOR_REVISION'}>Major revision</option>
              <option value={'REJECT'}>Reject</option>
            </select>
          </label>
          {locked ? (
            <p className={'confidential-note'}>
              Review telah dikirim dan dikunci. Hubungi editor jika koreksi diperlukan.
            </p>
          ) : (
            <div className={'workspace-actions'}>
              <button
                type={'submit'}
                name={'action'}
                value={'review-draft'}
                className={'secondary-button'}
              >
                Simpan draf
              </button>
              <button type={'submit'} name={'action'} value={'review-submit'}>
                Kirim review final
              </button>
            </div>
          )}
        </form>
        <ReviewFileUploader
          assignmentId={detail.id}
          files={detail.reviewFiles}
          locked={Boolean(locked)}
        />
      </div>
    </main>
  );
}
