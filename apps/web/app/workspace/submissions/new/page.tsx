import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface JournalSummary {
  slug: string;
}

interface JournalDetail {
  id: string;
  title: string;
  submissionsOpen: boolean;
  articleTypes: Array<{ id: string; title: string }>;
}

export default async function NewSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const cookieStore = await cookies();
  const auth = await fetch(`${apiBaseUrl}/submissions`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (auth.status === 401) redirect('/login');
  const listResponse = await fetch(`${apiBaseUrl}/journals`, { cache: 'no-store' });
  if (!listResponse.ok) throw new Error('Journal list could not be loaded.');
  const summaries = (await listResponse.json()) as JournalSummary[];
  const journals = (
    await Promise.all(
      summaries.map(async ({ slug }) => {
        const response = await fetch(`${apiBaseUrl}/journals/${slug}`, { cache: 'no-store' });
        return response.ok ? ((await response.json()) as JournalDetail) : null;
      }),
    )
  ).filter((journal): journal is JournalDetail => Boolean(journal?.submissionsOpen));
  const { error } = await searchParams;

  return (
    <main id="main-content" className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Submission baru</p>
          <h1>Pilih jurnal dan jenis artikel</h1>
          <p>
            Draf akan disimpan pada jurnal yang dipilih dan tidak dapat dipindahkan lintas tenant.
          </p>
        </div>
      </header>
      <section className="admin-next">
        {error ? (
          <div className="form-error" role="alert">
            Draf tidak dapat dibuat. Pastikan email telah diverifikasi dan submission masih dibuka.
          </div>
        ) : null}
        {journals.length ? (
          <form action="/auth/create-submission" method="post" className="auth-form">
            <label htmlFor="journalId">Jurnal</label>
            <select id="journalId" name="journalId" required>
              <option value="">Pilih jurnal</option>
              {journals.map((journal) => (
                <option key={journal.id} value={journal.id}>
                  {journal.title}
                </option>
              ))}
            </select>
            <label htmlFor="articleTypeId">Jenis artikel</label>
            <select id="articleTypeId" name="articleTypeId" required>
              <option value="">Pilih jenis artikel</option>
              {journals.flatMap((journal) =>
                journal.articleTypes.map((type) => (
                  <option
                    key={type.id}
                    value={type.id}
                    data-journal-id={journal.id}
                  >{`${journal.title} — ${type.title}`}</option>
                )),
              )}
            </select>
            <p className="field-help">
              Jenis artikel harus berasal dari jurnal yang sama; server akan menolak kombinasi
              lintas jurnal.
            </p>
            <button type="submit">Buat draf</button>
          </form>
        ) : (
          <div className="empty-state">
            <h2>Belum ada jurnal yang membuka submission</h2>
            <p>Silakan kembali setelah pengelola jurnal mengaktifkan penerimaan naskah.</p>
          </div>
        )}
      </section>
    </main>
  );
}
