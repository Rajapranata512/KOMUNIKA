import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { PublicPage } from '../../../../../components/public-chrome';
export const dynamic = 'force-dynamic';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
interface Issue {
  id: string;
  slug: string;
  title: string;
  volume: string;
  number: string;
  year: number;
  description: string;
  hasCover: boolean;
  journal: { slug: string; title: string };
  publications: Array<{
    id: string;
    slug: string;
    versions: Array<{
      title: string;
      authors: Array<{ name?: string; givenName?: string; familyName?: string }>;
      pages: string | null;
      eLocator: string | null;
      galleys: Array<{ id: string; label: string }>;
    }>;
  }>;
}
export default async function IssuePage({
  params,
}: {
  params: Promise<{ journalSlug: string; issueSlug: string }>;
}) {
  const { journalSlug, issueSlug } = await params;
  const response = await fetch(
    apiBaseUrl +
      '/public/journals/' +
      encodeURIComponent(journalSlug) +
      '/issues/' +
      encodeURIComponent(issueSlug),
    { cache: 'no-store' },
  );
  if (!response.ok) notFound();
  const issue = (await response.json()) as Issue;
  if (!issue) notFound();
  return (
    <PublicPage>
      <main id={'main-content'} className={'public-list-page'}>
        <header className={'page-intro'}>
          {issue.hasCover ? (
            <Image
              className={'issue-cover'}
              src={apiBaseUrl + '/public/issues/' + issue.id + '/cover'}
              alt={'Sampul ' + issue.title}
              width={320}
              height={440}
              unoptimized
            />
          ) : null}
          <p className={'eyebrow'}>{issue.journal.title}</p>
          <h1>{issue.title}</h1>
          <p className={'lede'}>
            Volume {issue.volume}, Nomor {issue.number} · {issue.year}
          </p>
          <p>{issue.description}</p>
        </header>
        <section className={'search-results'}>
          <h2>Daftar isi</h2>
          {issue.publications.map((publication) => {
            const version = publication.versions[0];
            return version ? (
              <article className={'article-result'} key={publication.id}>
                <h3>
                  <Link href={'/journals/' + issue.journal.slug + '/articles/' + publication.slug}>
                    {version.title}
                  </Link>
                </h3>
                <p>
                  {version.authors
                    .map(
                      (author) =>
                        author.name ??
                        [author.givenName, author.familyName].filter(Boolean).join(' '),
                    )
                    .join(' · ')}
                </p>
                <span>{version.pages ?? version.eLocator ?? ''}</span>
              </article>
            ) : null;
          })}
        </section>
      </main>
    </PublicPage>
  );
}
