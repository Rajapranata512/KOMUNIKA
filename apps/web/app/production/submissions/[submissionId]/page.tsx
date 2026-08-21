import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { GalleyUploader } from './galley-uploader';
import { SourceFileUploader } from './source-file-uploader';
import { IssueCoverUploader } from './issue-cover-uploader';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
type Snapshot = {
  title?: string;
  subtitle?: string;
  abstract?: string;
  language?: string;
  authors?: unknown[];
  keywords?: string[];
  files?: Array<{
    fileId: string;
    originalName: string;
    purpose: string;
    detectedMime?: string;
    size?: number;
  }>;
};
interface Context {
  submission: {
    id: string;
    state: string;
    title: string;
    journalId: string;
    journal: { title: string };
    acceptedVersion: { snapshot: Snapshot } | null;
  };
  assignments: Array<{
    id: string;
    stage: string;
    assignee: { fullName: string | null; email: string };
  }>;
  queries: Array<{ id: string; question: string; response: string; status: string }>;
  sourceFiles: Array<{
    id: string;
    storedFile: {
      id: string;
      originalName: string;
      size: number;
      detectedMime: string | null;
      scanStatus: string;
      createdAt: string;
    };
  }>;
  candidates: Array<{ role: string; user: { id: string; fullName: string | null; email: string } }>;
  issues: Array<{ id: string; title: string; volume: string; number: string; year: number }>;
  publication: null | {
    id: string;
    slug: string;
    status: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    issue: {
      id: string;
      coverFile: {
        id: string;
        originalName: string;
        scanStatus: string;
        visibility: string;
      } | null;
    } | null;
    versions: Array<{
      id: string;
      version: number;
      title: string;
      abstract: string;
      authors: unknown[];
      keywords: string[];
      language: string;
      licenseName: string;
      licenseUrl: string;
      copyrightHolder: string;
      pages: string | null;
      eLocator: string | null;
      galleys: Array<{
        id: string;
        approvedAt: string | null;
        label: string;
        format: string;
        storedFile: { id: string; originalName: string; scanStatus: string; visibility: string };
      }>;
    }>;
  };
  permissions: {
    isAuthor: boolean;
    canManage: boolean;
    canConfigure: boolean;
    canPublish: boolean;
  };
}
export default async function ProductionSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { submissionId } = await params;
  const result = (await searchParams).result;
  const jar = await cookies();
  const response = await fetch(apiBaseUrl + '/production/submissions/' + submissionId, {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) notFound();
  const context = (await response.json()) as Context;
  const latest = context.publication?.versions[0];
  const source = latest ?? context.submission.acceptedVersion?.snapshot ?? {};
  const authors = 'authors' in source && Array.isArray(source.authors) ? source.authors : [];
  const keywords = 'keywords' in source && Array.isArray(source.keywords) ? source.keywords : [];
  return (
    <main id={'main-content'} className={'editorial-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>{context.submission.journal.title}</p>
          <h1>{context.submission.title}</h1>
          <p>
            {context.submission.state} ·{' '}
            {context.publication?.status ?? 'Belum ada publication record'}
          </p>
        </div>
        <Link className={'secondary-button'} href={'/production'}>
          Kembali ke worklist
        </Link>
      </header>
      {result ? (
        <div role={'status'} className={result === 'success' ? 'form-success' : 'form-error'}>
          {result === 'success'
            ? 'Perubahan produksi berhasil disimpan.'
            : 'Tindakan ditolak. Periksa data dan authorization.'}
        </div>
      ) : null}
      <div className={'editorial-workspace'}>
        <section className={'editorial-manuscript'}>
          <h2>Metadata publikasi</h2>
          {context.submission.acceptedVersion?.snapshot.files?.length ? (
            <>
              <h3>File sumber accepted version</h3>
              <ul className={'editorial-record-list'}>
                {context.submission.acceptedVersion.snapshot.files.map((file) => (
                  <li key={file.fileId}>
                    <a
                      href={
                        '/auth/production-download?submissionId=' +
                        submissionId +
                        '&fileId=' +
                        file.fileId
                      }
                    >
                      <strong>{file.originalName}</strong>
                    </a>
                    <span>
                      {file.purpose} · {file.detectedMime ?? 'tipe terdeteksi'}
                      {file.size ? ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h3>Source file copyediting privat</h3>
          {context.permissions.canManage ? (
            <SourceFileUploader submissionId={submissionId} />
          ) : null}
          {context.sourceFiles.length ? (
            <ul className={'editorial-record-list'}>
              {context.sourceFiles.map(({ id, storedFile }) => (
                <li key={id}>
                  {storedFile.scanStatus === 'CLEAN' ? (
                    <a
                      href={
                        '/auth/production-download?submissionId=' +
                        submissionId +
                        '&fileId=' +
                        storedFile.id
                      }
                    >
                      <strong>{storedFile.originalName}</strong>
                    </a>
                  ) : (
                    <strong>{storedFile.originalName}</strong>
                  )}
                  <span>
                    {storedFile.scanStatus} · {(storedFile.size / 1024 / 1024).toFixed(2)} MB ·
                    privat
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Belum ada source file copyediting.</p>
          )}
          {context.permissions.canConfigure ? (
            <form
              action={'/auth/production-action'}
              method={'post'}
              className={'editorial-action-form'}
            >
              <input type={'hidden'} name={'action'} value={'issue'} />
              <input type={'hidden'} name={'submissionId'} value={submissionId} />
              <input type={'hidden'} name={'journalId'} value={context.submission.journalId} />
              <h3>Buat issue</h3>
              <label>
                Slug
                <input name={'slug'} required pattern={'[a-z0-9]+(?:-[a-z0-9]+)*'} />
              </label>
              <label>
                Volume
                <input name={'volume'} required />
              </label>
              <label>
                Nomor
                <input name={'number'} required />
              </label>
              <label>
                Tahun
                <input
                  name={'year'}
                  type={'number'}
                  min={1900}
                  max={2200}
                  defaultValue={new Date().getFullYear()}
                  required
                />
              </label>
              <label>
                Judul issue
                <input name={'title'} required />
              </label>
              <label>
                Deskripsi
                <textarea name={'description'} rows={3} />
              </label>
              <button type={'submit'}>Buat issue</button>
            </form>
          ) : null}
          {context.permissions.canManage ? (
            <form
              action={'/auth/production-action'}
              method={'post'}
              className={'editorial-action-form'}
            >
              <input type={'hidden'} name={'action'} value={'prepare'} />
              <input type={'hidden'} name={'submissionId'} value={submissionId} />
              <input type={'hidden'} name={'authors'} value={JSON.stringify(authors)} />
              <label>
                Slug artikel
                <input
                  name={'slug'}
                  required
                  pattern={'[a-z0-9]+(?:-[a-z0-9]+)*'}
                  defaultValue={context.publication?.slug ?? ''}
                />
              </label>
              <label>
                Judul
                <input
                  name={'title'}
                  required
                  defaultValue={'title' in source ? String(source.title ?? '') : ''}
                />
              </label>
              <label>
                Subjudul
                <input
                  name={'subtitle'}
                  defaultValue={'subtitle' in source ? String(source.subtitle ?? '') : ''}
                />
              </label>
              <label>
                Abstrak
                <textarea
                  name={'abstract'}
                  rows={8}
                  required
                  defaultValue={'abstract' in source ? String(source.abstract ?? '') : ''}
                />
              </label>
              <label>
                Kata kunci (pisahkan koma)
                <input name={'keywords'} defaultValue={keywords.join(', ')} />
              </label>
              <label>
                Bahasa
                <input
                  name={'language'}
                  required
                  defaultValue={'language' in source ? String(source.language ?? 'id') : 'id'}
                />
              </label>
              <label>
                Issue
                <select name={'issueId'} defaultValue={context.publication?.issue?.id ?? ''}>
                  <option value={''}>Pilih issue</option>
                  {context.issues.map((issue) => (
                    <option key={issue.id} value={issue.id}>
                      Vol. {issue.volume} No. {issue.number} ({issue.year}) — {issue.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Urutan artikel
                <input name={'articleOrder'} type={'number'} min={0} defaultValue={0} />
              </label>
              <label>
                Nama lisensi
                <input
                  name={'licenseName'}
                  required
                  defaultValue={
                    latest?.licenseName ?? 'Creative Commons Attribution 4.0 International'
                  }
                />
              </label>
              <label>
                URL lisensi
                <input
                  name={'licenseUrl'}
                  type={'url'}
                  required
                  defaultValue={
                    latest?.licenseUrl ?? 'https://creativecommons.org/licenses/by/4.0/'
                  }
                />
              </label>
              <label>
                Pemegang hak cipta
                <input
                  name={'copyrightHolder'}
                  required
                  defaultValue={latest?.copyrightHolder ?? ''}
                />
              </label>
              <label>
                Halaman
                <input name={'pages'} defaultValue={latest?.pages ?? ''} />
              </label>
              <label>
                eLocator
                <input name={'eLocator'} defaultValue={latest?.eLocator ?? ''} />
              </label>
              <button type={'submit'}>Simpan versi metadata</button>
            </form>
          ) : (
            <p>Metadata hanya dapat diubah oleh petugas yang ditugaskan.</p>
          )}
        </section>
        <section className={'editorial-stage'}>
          <h2>Copyediting dan komunikasi</h2>
          <ul className={'editorial-record-list'}>
            {context.assignments.map((assignment) => (
              <li key={assignment.id}>
                <strong>{assignment.stage}</strong>
                <span>{assignment.assignee.fullName ?? assignment.assignee.email}</span>
              </li>
            ))}
          </ul>
          {context.candidates.length ? (
            <form
              action={'/auth/production-action'}
              method={'post'}
              className={'editorial-action-form'}
            >
              <input type={'hidden'} name={'action'} value={'assign'} />
              <input type={'hidden'} name={'submissionId'} value={submissionId} />
              <label>
                Stage
                <select name={'stage'}>
                  <option value={'COPYEDITING'}>Copyediting</option>
                  <option value={'PRODUCTION'}>Production</option>
                </select>
              </label>
              <label>
                Petugas
                <select name={'assigneeId'}>
                  {context.candidates.map((candidate) => (
                    <option key={candidate.role + candidate.user.id} value={candidate.user.id}>
                      {candidate.user.fullName ?? candidate.user.email} — {candidate.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Catatan
                <textarea name={'note'} rows={3} />
              </label>
              <button type={'submit'}>Tetapkan petugas</button>
            </form>
          ) : null}
          <h3>Query</h3>
          {context.queries.map((query) => (
            <article key={query.id} className={'confidential-note'}>
              <strong>{query.status}</strong>
              <p>{query.question}</p>
              {query.response ? (
                <p>Jawaban: {query.response}</p>
              ) : context.permissions.isAuthor ? (
                <form
                  action={'/auth/production-action'}
                  method={'post'}
                  className={'editorial-action-form'}
                >
                  <input type={'hidden'} name={'action'} value={'answer'} />
                  <input type={'hidden'} name={'submissionId'} value={submissionId} />
                  <input type={'hidden'} name={'queryId'} value={query.id} />
                  <textarea name={'response'} minLength={10} required />
                  <button type={'submit'}>Kirim jawaban</button>
                </form>
              ) : null}
            </article>
          ))}
          {context.permissions.canManage ? (
            <form
              action={'/auth/production-action'}
              method={'post'}
              className={'editorial-action-form'}
            >
              <input type={'hidden'} name={'action'} value={'query'} />
              <input type={'hidden'} name={'submissionId'} value={submissionId} />
              <label>
                Query baru
                <textarea name={'question'} minLength={10} required />
              </label>
              <button type={'submit'}>Kirim query ke author</button>
            </form>
          ) : null}
        </section>
        <aside className={'editorial-actions'}>
          <h2>Galley dan publikasi</h2>
          {context.publication ? (
            <Link
              className={'secondary-button'}
              href={'/production/submissions/' + submissionId + '/preview'}
            >
              Preview halaman publik
            </Link>
          ) : null}
          {context.publication?.issue && context.permissions.canConfigure ? (
            <>
              <h3>Sampul edisi</h3>
              <IssueCoverUploader issueId={context.publication.issue.id} />
              {context.publication.issue.coverFile ? (
                <div className={'confidential-note'}>
                  <strong>{context.publication.issue.coverFile.originalName}</strong>
                  <p>
                    {context.publication.issue.coverFile.scanStatus} ·{' '}
                    {context.publication.issue.coverFile.visibility}
                  </p>
                  {context.publication.issue.coverFile.scanStatus === 'CLEAN' &&
                  context.publication.issue.coverFile.visibility !== 'PUBLIC' ? (
                    <form action={'/auth/production-action'} method={'post'}>
                      <input type={'hidden'} name={'action'} value={'approve-cover'} />
                      <input type={'hidden'} name={'submissionId'} value={submissionId} />
                      <input
                        type={'hidden'}
                        name={'issueId'}
                        value={context.publication.issue.id}
                      />
                      <button type={'submit'}>Setujui sampul publik</button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          {latest && context.permissions.canManage ? (
            <GalleyUploader versionId={latest.id} />
          ) : (
            <p>Simpan metadata sebelum mengunggah galley.</p>
          )}
          <ul className={'editorial-record-list'}>
            {latest?.galleys.map((galley) => (
              <li key={galley.id}>
                <strong>
                  {galley.label} · {galley.storedFile.originalName}
                </strong>
                <span>
                  {galley.storedFile.scanStatus} · {galley.storedFile.visibility}
                </span>
                {galley.storedFile.scanStatus === 'CLEAN' &&
                !galley.approvedAt &&
                context.permissions.canManage ? (
                  <form action={'/auth/production-action'} method={'post'}>
                    <input type={'hidden'} name={'action'} value={'approve-galley'} />
                    <input type={'hidden'} name={'submissionId'} value={submissionId} />
                    <input type={'hidden'} name={'galleyId'} value={galley.id} />
                    <button type={'submit'}>Setujui galley publik</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {context.publication && context.permissions.canPublish ? (
            <>
              <form
                action={'/auth/production-action'}
                method={'post'}
                className={'editorial-action-form'}
              >
                <input type={'hidden'} name={'action'} value={'schedule'} />
                <input type={'hidden'} name={'submissionId'} value={submissionId} />
                <input type={'hidden'} name={'publicationId'} value={context.publication.id} />
                <label>
                  Jadwal terbit (UTC)
                  <input type={'datetime-local'} name={'scheduledAt'} required />
                </label>
                <button type={'submit'}>Jadwalkan publikasi</button>
              </form>
              {context.publication.status === 'SCHEDULED' ? (
                <form
                  action={'/auth/production-action'}
                  method={'post'}
                  className={'editorial-action-form'}
                >
                  <input type={'hidden'} name={'action'} value={'publish'} />
                  <input type={'hidden'} name={'submissionId'} value={submissionId} />
                  <input type={'hidden'} name={'publicationId'} value={context.publication.id} />
                  <input
                    type={'hidden'}
                    name={'idempotencyKey'}
                    value={'publish-' + context.publication.id}
                  />
                  <button type={'submit'}>Publikasikan saat jadwal tercapai</button>
                </form>
              ) : null}
              {['PUBLISHED', 'WITHDRAWN'].includes(context.publication.status) ? (
                <form
                  action={'/auth/production-action'}
                  method={'post'}
                  className={'editorial-action-form'}
                >
                  <input type={'hidden'} name={'action'} value={'update'} />
                  <input type={'hidden'} name={'submissionId'} value={submissionId} />
                  <input type={'hidden'} name={'publicationId'} value={context.publication.id} />
                  <h3>Pembaruan rekam publik</h3>
                  <label>
                    Jenis
                    <select name={'type'}>
                      <option value={'CORRECTION'}>Correction</option>
                      <option value={'WITHDRAWAL'}>Withdrawal</option>
                      <option value={'RETRACTION'}>Retraction</option>
                    </select>
                  </label>
                  <label>
                    Alasan internal/audit
                    <textarea name={'reason'} minLength={20} rows={4} required />
                  </label>
                  <label>
                    Notice publik
                    <textarea name={'notice'} minLength={40} rows={6} required />
                  </label>
                  <button type={'submit'}>Catat pembaruan publik</button>
                </form>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
