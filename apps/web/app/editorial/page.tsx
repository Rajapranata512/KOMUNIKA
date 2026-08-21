import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface EditorialJournal {
  id: string;
  title: string;
  abbreviation: string;
  memberships: Array<{ role: 'EDITOR_IN_CHIEF' | 'SECTION_EDITOR' }>;
  _count: { submissions: number };
}

interface QueueItem {
  id: string;
  title: string;
  state: string;
  submittedAt: string | null;
  ageInDays: number;
  nextAction: string;
  articleType: { title: string };
  editorialAssignments: Array<{
    editor: { id: string; email: string; fullName: string | null };
  }>;
}

interface QueueResponse {
  items: QueueItem[];
  nextCursor: string | null;
}

export default async function EditorialQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const headers = { cookie: cookieStore.toString() };
  const journalsResponse = await fetch(`${apiBaseUrl}/editorial/journals`, {
    headers,
    cache: 'no-store',
  });
  if (journalsResponse.status === 401) redirect('/login');
  if (!journalsResponse.ok) throw new Error('Editorial journals could not be loaded.');
  const journals = (await journalsResponse.json()) as EditorialJournal[];
  const selectedJournalId =
    journals.find(({ id }) => id === params.journalId)?.id ?? journals[0]?.id ?? '';
  const query = new URLSearchParams();
  if (selectedJournalId) query.set('journalId', selectedJournalId);
  for (const key of ['state', 'q', 'assigned', 'sort', 'cursor'] as const)
    if (params[key]) query.set(key, params[key] ?? '');
  const queueResponse = selectedJournalId
    ? await fetch(`${apiBaseUrl}/editorial/queue?${query}`, { headers, cache: 'no-store' })
    : null;
  if (queueResponse?.status === 403) redirect('/workspace');
  if (queueResponse && !queueResponse.ok) throw new Error('Editorial queue could not be loaded.');
  const queue = queueResponse ? ((await queueResponse.json()) as QueueResponse) : null;
  const selectedJournal = journals.find(({ id }) => id === selectedJournalId);

  return (
    <main id="main-content" className="editorial-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Operasi editorial</p>
          <h1>Queue screening</h1>
          <p>
            Prioritaskan submission tertua, catat pemeriksaan, dan lanjutkan tindakan secara
            teraudit.
          </p>
        </div>
        <Link className="secondary-button" href="/workspace">
          Workspace penulis
        </Link>
      </header>
      {!journals.length ? (
        <section className="permission-state" role="status">
          <h2>Belum ada akses editorial</h2>
          <p>
            Akun ini belum memiliki role Editor-in-Chief atau Section Editor pada jurnal mana pun.
          </p>
        </section>
      ) : (
        <>
          <form className="editorial-filters" method="get">
            <label>
              Jurnal
              <select name="journalId" defaultValue={selectedJournalId}>
                {journals.map((journal) => (
                  <option key={journal.id} value={journal.id}>
                    {journal.title} ({journal._count.submissions})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tahap
              <select name="state" defaultValue={params.state ?? ''}>
                <option value="">Semua tahap screening</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="INITIAL_SCREENING">Initial screening</option>
                <option value="PRE_REVIEW_CORRECTION_REQUESTED">Menunggu koreksi</option>
                <option value="EDITOR_ASSIGNED">Editor assigned</option>
              </select>
            </label>
            <label>
              Assignment
              <select name="assigned" defaultValue={params.assigned ?? 'all'}>
                <option value="all">Semua</option>
                <option value="unassigned">Belum ditugaskan</option>
                <option value="mine">Ditugaskan kepada saya</option>
              </select>
            </label>
            <label>
              Urutan
              <select name="sort" defaultValue={params.sort ?? 'oldest'}>
                <option value="oldest">Paling mendesak</option>
                <option value="newest">Terbaru</option>
              </select>
            </label>
            <label className="editorial-search-field">
              Cari judul
              <input name="q" defaultValue={params.q ?? ''} />
            </label>
            <button type="submit">Terapkan filter</button>
          </form>
          <section className="editorial-queue" aria-labelledby="queue-heading">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">{selectedJournal?.abbreviation}</p>
                <h2 id="queue-heading">Submission yang memerlukan tindakan</h2>
              </div>
              <p>{queue?.items.length ?? 0} item pada halaman ini</p>
            </div>
            {queue?.items.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Submission</th>
                      <th>Tahap</th>
                      <th>Editor</th>
                      <th>Tindakan berikut</th>
                      <th>Usia tahap</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.title}</strong>
                          <small>{item.articleType.title}</small>
                        </td>
                        <td>{item.state}</td>
                        <td>
                          {item.editorialAssignments[0]?.editor.fullName ??
                            item.editorialAssignments[0]?.editor.email ??
                            'Belum ditugaskan'}
                        </td>
                        <td>{item.nextAction}</td>
                        <td>
                          {item.ageInDays > 7 ? <span aria-label="Mendesak">⚠ </span> : null}
                          {item.ageInDays} hari
                        </td>
                        <td>
                          <Link href={`/editorial/submissions/${item.id}`}>Buka</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <h3>Queue bersih</h3>
                <p>Tidak ada submission yang cocok dengan filter saat ini.</p>
              </div>
            )}
            {queue?.nextCursor ? (
              <Link
                className="secondary-button"
                href={`/editorial?${new URLSearchParams({ ...Object.fromEntries(query), cursor: queue.nextCursor })}`}
              >
                Halaman berikutnya
              </Link>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
