import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PublicPage } from '../../../../../components/public-chrome';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
interface Context {
  submission: { id: string; journal: { title: string; slug: string } };
  publication: null | {
    slug: string;
    issue: { title: string; volume: string; number: string; year: number } | null;
    versions: Array<{
      title: string;
      subtitle: string | null;
      abstract: string;
      authors: Array<{
        name?: string;
        givenName?: string;
        familyName?: string;
        affiliation?: string;
      }>;
      keywords: string[];
      licenseName: string;
      licenseUrl: string;
      galleys: Array<{ id: string; label: string; format: string; approvedAt: string | null }>;
    }>;
  };
}
export default async function PublicationPreview({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const jar = await cookies();
  const response = await fetch(apiBaseUrl + '/production/submissions/' + submissionId, {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) notFound();
  const context = (await response.json()) as Context;
  const version = context.publication?.versions[0];
  if (!context.publication || !version) notFound();
  return (
    <PublicPage>
      <main id={'main-content'} className={'public-list-page article-reading-page'}>
        <div className={'form-success'} role={'status'}>
          Preview privat — halaman ini belum dipublikasikan atau diindeks.
        </div>
        <nav aria-label={'Breadcrumb'}>
          <Link href={'/production/submissions/' + submissionId}>
            Kembali ke workspace produksi
          </Link>
        </nav>
        <article>
          <header className={'page-intro'}>
            <p className={'eyebrow'}>{context.submission.journal.title}</p>
            <h1>{version.title}</h1>
            {version.subtitle ? <p className={'lede'}>{version.subtitle}</p> : null}
            <p>
              {version.authors
                .map(
                  (author) =>
                    author.name ?? [author.givenName, author.familyName].filter(Boolean).join(' '),
                )
                .join(' · ')}
            </p>
          </header>
          <section>
            <h2>Abstrak</h2>
            <p className={'long-form-copy'}>{version.abstract}</p>
          </section>
          {context.publication.issue ? (
            <p>
              Volume {context.publication.issue.volume}, Nomor {context.publication.issue.number} (
              {context.publication.issue.year})
            </p>
          ) : null}
          <section>
            <h2>Galley yang akan tampil</h2>
            <ul className={'policy-list'}>
              {version.galleys
                .filter(({ approvedAt }) => approvedAt)
                .map((galley) => (
                  <li key={galley.id}>
                    {galley.label} ({galley.format})
                  </li>
                ))}
            </ul>
          </section>
          <p>
            Lisensi: <a href={version.licenseUrl}>{version.licenseName}</a>
          </p>
        </article>
      </main>
    </PublicPage>
  );
}
