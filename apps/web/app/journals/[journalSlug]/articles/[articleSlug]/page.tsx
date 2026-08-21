import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicPage } from '../../../../../components/public-chrome';

export const dynamic = 'force-dynamic';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
type Author = { givenName?: string; familyName?: string; name?: string; affiliation?: string };
interface Article {
  slug: string;
  status: string;
  publishedAt: string;
  journal: { slug: string; title: string };
  issue: { slug: string; title: string; volume: string; number: string; year: number } | null;
  versions: Array<{
    title: string;
    subtitle: string | null;
    abstract: string;
    authors: Author[];
    keywords: string[];
    language: string;
    licenseName: string;
    licenseUrl: string;
    copyrightHolder: string;
    pages: string | null;
    eLocator: string | null;
    doi: string | null;
    galleys: Array<{ id: string; label: string; format: string; locale: string }>;
  }>;
  updates: Array<{ id: string; type: string; notice: string; effectiveAt: string }>;
}
type ArticleParams = { journalSlug: string; articleSlug: string };
async function loadArticle({ journalSlug, articleSlug }: ArticleParams) {
  const response = await fetch(
    apiBaseUrl +
      '/public/articles/' +
      encodeURIComponent(journalSlug) +
      '/' +
      encodeURIComponent(articleSlug),
    { cache: 'no-store' },
  );
  return response.ok ? ((await response.json()) as Article | null) : null;
}
export async function generateMetadata({
  params,
}: {
  params: Promise<ArticleParams>;
}): Promise<Metadata> {
  const values = await params;
  const article = await loadArticle(values);
  const version = article?.versions[0];
  if (!article || !version) return { title: 'Artikel tidak ditemukan' };
  const canonical = '/journals/' + article.journal.slug + '/articles/' + article.slug;
  return {
    title: version.title,
    description: version.abstract.slice(0, 300),
    alternates: { canonical },
    authors: version.authors.map((author) => ({
      name: author.name ?? [author.givenName, author.familyName].filter(Boolean).join(' '),
    })),
  };
}

export default async function ArticlePage({ params }: { params: Promise<ArticleParams> }) {
  const values = await params;
  const article = await loadArticle(values);
  if (!article) notFound();
  const version = article.versions[0];
  if (!version) notFound();
  const canonicalUrl = new URL(
    '/journals/' + article.journal.slug + '/articles/' + article.slug,
    process.env.APP_BASE_URL ?? 'http://localhost:3000',
  ).toString();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: version.title,
    description: version.abstract,
    inLanguage: version.language,
    datePublished: article.publishedAt,
    url: canonicalUrl,
    isPartOf: { '@type': 'Periodical', name: article.journal.title },
    author: version.authors.map((author) => ({
      '@type': 'Person',
      name: author.name ?? [author.givenName, author.familyName].filter(Boolean).join(' '),
      ...(author.affiliation
        ? { affiliation: { '@type': 'Organization', name: author.affiliation } }
        : {}),
    })),
    keywords: version.keywords.join(', '),
    license: version.licenseUrl,
    ...(version.doi ? { identifier: 'https://doi.org/' + version.doi } : {}),
  };
  return (
    <PublicPage>
      <script
        type={'application/ld+json'}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll('<', '\\u003c') }}
      />
      <main id={'main-content'} className={'public-list-page article-reading-page'}>
        <nav aria-label={'Breadcrumb'}>
          <Link href={'/journals/' + article.journal.slug}>{article.journal.title}</Link>
          {article.issue ? (
            <>
              {' '}
              /{' '}
              <Link href={'/journals/' + article.journal.slug + '/issues/' + article.issue.slug}>
                {article.issue.title}
              </Link>
            </>
          ) : null}
        </nav>
        <article>
          <header className={'page-intro'}>
            <p className={'eyebrow'}>{article.status}</p>
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
          {article.updates.map((update) => (
            <aside key={update.id} className={'form-error'}>
              <strong>{update.type}</strong>
              <p>{update.notice}</p>
            </aside>
          ))}
          <section>
            <h2>Abstrak</h2>
            <p className={'long-form-copy'}>{version.abstract}</p>
          </section>
          <aside className={'journal-metadata'}>
            <div>
              <dt>Diterbitkan</dt>
              <dd>{new Date(article.publishedAt).toLocaleDateString('id-ID')}</dd>
            </div>
            {article.issue ? (
              <div>
                <dt>Issue</dt>
                <dd>
                  Vol. {article.issue.volume}, No. {article.issue.number} ({article.issue.year})
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Lisensi</dt>
              <dd>
                <a href={version.licenseUrl}>{version.licenseName}</a>
              </dd>
            </div>
            {version.doi ? (
              <div>
                <dt>DOI</dt>
                <dd>{version.doi}</dd>
              </div>
            ) : null}
          </aside>
          <section>
            <h2>Galley</h2>
            <ul className={'policy-list'}>
              {version.galleys.map((galley) => (
                <li key={galley.id}>
                  <a href={apiBaseUrl + '/public/galleys/' + galley.id}>
                    {galley.label} ({galley.format})
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>
    </PublicPage>
  );
}
