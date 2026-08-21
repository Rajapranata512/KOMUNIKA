import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface Assignment {
  id: string;
  active: boolean;
  dueAt: string;
  lockedAt: string | null;
  response: { status: string; submittedAt: string | null } | null;
  round: { sequence: number; submission: { title: string }; journal: { title: string } };
}

export default async function ReviewerWorkspacePage() {
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/reviews/assignments`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Reviewer assignments could not be loaded.');
  const assignments = (await response.json()) as Assignment[];
  return (
    <main id={'main-content'} className={'admin-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>Workspace reviewer</p>
          <h1>Peer review saya</h1>
          <p>
            Assignment hanya tersedia setelah undangan diterima dan sampai tenggat atau penguncian
            editor.
          </p>
        </div>
        <Link className={'secondary-button'} href={'/workspace'}>
          Workspace utama
        </Link>
      </header>
      <section className={'admin-next'} aria-labelledby={'assignments-heading'}>
        <h2 id={'assignments-heading'}>Assignment</h2>
        {assignments.length ? (
          <div className={'table-wrap'}>
            <table>
              <thead>
                <tr>
                  <th>Naskah</th>
                  <th>Round</th>
                  <th>Tenggat</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>
                      <strong>{assignment.round.submission.title}</strong>
                      <small>{assignment.round.journal.title}</small>
                    </td>
                    <td>{assignment.round.sequence}</td>
                    <td>{new Date(assignment.dueAt).toLocaleString('id-ID')}</td>
                    <td>{assignment.response?.status ?? 'DRAFT'}</td>
                    <td>
                      <Link href={`/reviewer/assignments/${assignment.id}`}>Buka review</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={'empty-state'}>
            <h3>Belum ada assignment</h3>
            <p>Buka tautan undangan dari email dan terima setelah menyatakan tidak ada konflik.</p>
          </div>
        )}
      </section>
    </main>
  );
}
