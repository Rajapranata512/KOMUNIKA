import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  authorProgressLabels,
  authorProgressPhases,
  getAuthorProgressPhase,
  submissionStateLabels,
  type SubmissionState,
} from '@aksara/domain';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface SubmissionSummary {
  id: string;
  state: SubmissionState;
  title: string;
  submittedAt: string | null;
  updatedAt: string;
  journal: { title: string };
  articleType: { title: string };
}

export default async function WorkspacePage() {
  const cookieStore = await cookies();
  const headers = { cookie: cookieStore.toString() };
  const [response, editorialResponse, reviewResponse, productionResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/submissions`, { headers, cache: 'no-store' }),
    fetch(`${apiBaseUrl}/editorial/journals`, { headers, cache: 'no-store' }),
    fetch(`${apiBaseUrl}/reviews/assignments`, { headers, cache: 'no-store' }),
    fetch(`${apiBaseUrl}/production/worklist`, { headers, cache: 'no-store' }),
  ]);
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Submission workspace could not be loaded.');
  const submissions = (await response.json()) as SubmissionSummary[];
  const hasEditorialAccess =
    editorialResponse.ok && ((await editorialResponse.json()) as Array<{ id: string }>).length > 0;
  const hasReviewAssignments =
    reviewResponse.ok && ((await reviewResponse.json()) as Array<{ id: string }>).length > 0;
  const hasProductionAccess =
    productionResponse.ok &&
    ((await productionResponse.json()) as Array<{ id: string }>).length > 0;
  return (
    <main id="main-content" className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Ruang kerja penulis</p>
          <h1>Submission saya</h1>
          <p>Kelola draf dan pantau naskah dalam satu riwayat yang dapat ditelusuri.</p>
        </div>
        <div className="workspace-actions">
          {hasReviewAssignments ? (
            <Link className="secondary-button" href="/reviewer">
              Workspace reviewer
            </Link>
          ) : null}
          {hasEditorialAccess ? (
            <Link className="secondary-button" href="/editorial">
              Workspace editorial
            </Link>
          ) : null}
          {hasProductionAccess ? (
            <Link className={'secondary-button'} href={'/production'}>
              Workspace produksi
            </Link>
          ) : null}
          <Link className="secondary-button" href="/workspace/profile">
            Profil
          </Link>
          <Link className="button-link" href="/workspace/submissions/new">
            Submit naskah
          </Link>
        </div>
      </header>
      <section className={'author-progress-guide'} aria-labelledby={'progress-guide-heading'}>
        <div>
          <p className={'eyebrow'}>Progres naskah</p>
          <h2 id={'progress-guide-heading'}>Empat tahap yang mudah dipantau</h2>
        </div>
        <ol>
          {authorProgressPhases.map((phase, index) => (
            <li key={phase}>
              <span>{index + 1}</span>
              <strong>{authorProgressLabels[phase]}</strong>
            </li>
          ))}
        </ol>
      </section>
      <section className="admin-next" aria-labelledby="submission-list-heading">
        <h2 id="submission-list-heading">Draf dan submission aktif</h2>
        {submissions.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Jurnal</th>
                  <th>Status</th>
                  <th>Terakhir disimpan</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>{submission.title || 'Draf tanpa judul'}</td>
                    <td>
                      {submission.journal.title}
                      <br />
                      <small>{submission.articleType.title}</small>
                    </td>
                    <td>
                      <span className={'submission-public-status'}>
                        {getAuthorProgressPhase(submission.state)
                          ? authorProgressLabels[getAuthorProgressPhase(submission.state)!]
                          : submissionStateLabels[submission.state]}
                      </span>
                      <small>{submissionStateLabels[submission.state]}</small>
                    </td>
                    <td>{new Date(submission.updatedAt).toLocaleString('id-ID')}</td>
                    <td>
                      <Link href={`/workspace/submissions/${submission.id}`}>Buka</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>Belum ada submission</h3>
            <p>Pilih jurnal yang membuka submission untuk memulai draf pertama.</p>
          </div>
        )}
      </section>
    </main>
  );
}
