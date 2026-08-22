import { notFound } from 'next/navigation';

import { PublicPage } from '../../../components/public-chrome';

export const dynamic = 'force-dynamic';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface JournalPageProps {
  params: Promise<{ journalSlug: string }>;
}

interface PublicJournal {
  title: string;
  abbreviation: string;
  description: string;
  scope: string;
  contactEmail: string;
  printIssn: string | null;
  electronicIssn: string | null;
  primaryLanguage: string;
  reviewModel: 'SINGLE_ANONYMOUS' | 'DOUBLE_ANONYMOUS';
  submissionsOpen: boolean;
  sections: Array<{ slug: string; title: string; description: string }>;
  articleTypes: Array<{
    slug: string;
    title: string;
    description: string;
    peerReviewRequired: boolean;
    section: { title: string } | null;
  }>;
  checklistItems: Array<{ label: string; isRequired: boolean }>;
  declarations: Array<{ code: string; title: string; body: string }>;
  templates: Array<{
    kind: 'AUTHOR_GUIDELINES' | 'MANUSCRIPT_TEMPLATE' | 'COPYRIGHT_NOTICE';
    slug: string;
    title: string;
    body: string;
  }>;
}
interface PublicIssue {
  id: string;
  slug: string;
  title: string;
  volume: string;
  number: string;
  year: number;
  _count: { publications: number };
}

export default async function JournalPage({ params }: JournalPageProps) {
  const { journalSlug } = await params;
  const [response, issuesResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/journals/${encodeURIComponent(journalSlug)}`, { cache: 'no-store' }),
    fetch(`${apiBaseUrl}/public/journals/${encodeURIComponent(journalSlug)}/issues`, {
      cache: 'no-store',
    }),
  ]);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Journal could not be loaded.');
  const journal = (await response.json()) as PublicJournal;
  const issues = issuesResponse.ok ? ((await issuesResponse.json()) as PublicIssue[]) : [];
  return (
    <PublicPage>
      <main id={'main-content'} className={'public-list-page'}>
        <header className={'page-intro'}>
          <p className={'eyebrow'}>{journal.abbreviation}</p>
          <h1>{journal.title}</h1>
          <p className={'lede'}>{journal.description}</p>
        </header>
        <section className={'journal-detail'} aria-labelledby={'issues-heading'}>
          <div>
            <h2 id={'issues-heading'}>Arsip issue</h2>
            {issues.length ? (
              <ul className={'policy-list'}>
                {issues.map((issue) => (
                  <li key={issue.id}>
                    <a href={`/journals/${journalSlug}/issues/${issue.slug}`}>
                      <strong>{issue.title}</strong>
                    </a>
                    <p>
                      Volume {issue.volume}, Nomor {issue.number} ({issue.year}) ·{' '}
                      {issue._count.publications} artikel
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Belum ada issue yang dipublikasikan.</p>
            )}
          </div>
        </section>
        <section className={'journal-detail'} aria-labelledby={'scope-heading'}>
          <div>
            <h2 id={'scope-heading'}>Fokus dan ruang lingkup</h2>
            <p>{journal.scope}</p>
          </div>
          <dl className={'journal-metadata'}>
            <div>
              <dt>Kontak</dt>
              <dd>
                <a href={`mailto:${journal.contactEmail}`}>{journal.contactEmail}</a>
              </dd>
            </div>
            <div>
              <dt>Bahasa utama</dt>
              <dd>{journal.primaryLanguage}</dd>
            </div>
            <div>
              <dt>Model review</dt>
              <dd>
                {journal.reviewModel === 'DOUBLE_ANONYMOUS'
                  ? 'Double-anonymous'
                  : 'Single-anonymous'}
              </dd>
            </div>
            <div>
              <dt>ISSN cetak</dt>
              <dd>{journal.printIssn ?? 'Belum ditetapkan'}</dd>
            </div>
            <div>
              <dt>ISSN elektronik</dt>
              <dd>{journal.electronicIssn ?? 'Belum ditetapkan'}</dd>
            </div>
            <div>
              <dt>Status indeksasi</dt>
              <dd>Tidak diklaim</dd>
            </div>
          </dl>
        </section>
        {journal.sections.length ? (
          <section className={'journal-detail'} aria-labelledby={'sections-heading'}>
            <div>
              <h2 id={'sections-heading'}>Seksi</h2>
              <ul className={'policy-list'}>
                {journal.sections.map((section) => (
                  <li key={section.slug}>
                    <strong>{section.title}</strong>
                    {section.description ? <p>{section.description}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
        {journal.articleTypes.length ? (
          <section className={'journal-detail'} aria-labelledby={'article-types-heading'}>
            <div>
              <h2 id={'article-types-heading'}>Jenis artikel</h2>
              <ul className={'policy-list'}>
                {journal.articleTypes.map((articleType) => (
                  <li key={articleType.slug}>
                    <strong>{articleType.title}</strong>
                    <p>
                      {articleType.section ? `Seksi ${articleType.section.title}. ` : ''}
                      {articleType.peerReviewRequired
                        ? 'Peer review wajib.'
                        : 'Peer review tidak diwajibkan untuk jenis ini.'}
                    </p>
                    {articleType.description ? <p>{articleType.description}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
        {journal.checklistItems.length ? (
          <section className={'journal-detail'} aria-labelledby={'checklist-heading'}>
            <div>
              <h2 id={'checklist-heading'}>Checklist pengajuan</h2>
              <ul className={'policy-list'}>
                {journal.checklistItems.map((item) => (
                  <li key={item.label}>
                    {item.label}
                    {item.isRequired ? ' (wajib)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
        {journal.declarations.map((declaration) => (
          <section
            key={declaration.code}
            className={'journal-detail'}
            aria-labelledby={`declaration-${declaration.code}`}
          >
            <div>
              <h2 id={`declaration-${declaration.code}`}>{declaration.title}</h2>
              <p>{declaration.body}</p>
            </div>
          </section>
        ))}
        {journal.templates.map((template) => (
          <section
            key={template.slug}
            className={'journal-detail'}
            aria-labelledby={`template-${template.slug}`}
          >
            <div>
              <h2 id={`template-${template.slug}`}>{template.title}</h2>
              <p>{template.body}</p>
            </div>
          </section>
        ))}
      </main>
    </PublicPage>
  );
}
