import Link from 'next/link';
import { PublicPage } from '../../components/public-chrome';

export const dynamic = 'force-dynamic';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
type Author = { givenName?: string; familyName?: string; name?: string };
interface Result {
  id: string;
  slug: string;
  publishedAt: string;
  journal: { slug: string; title: string };
  issue: { title: string; year: number } | null;
  versions: Array<{ title: string; authors: Author[]; keywords: string[] }>;
}
interface Facets {
  journals: Array<{ slug: string; title: string }>;
  sections: Array<{ slug: string; title: string; journal: { title: string } }>;
  articleTypes: Array<{ slug: string; title: string; journal: { title: string } }>;
  issues: Array<{
    slug: string;
    title: string;
    volume: string;
    number: string;
    year: number;
    journal: { title: string };
  }>;
}
const names = (authors: Author[]) =>
  authors
    .map((author) => author.name ?? [author.givenName, author.familyName].filter(Boolean).join(' '))
    .join(' · ');

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    journal?: string;
    section?: string;
    articleType?: string;
    issue?: string;
    year?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? '';
  const apiParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.trim()) apiParams.set(key, value.trim());
  }
  const hasSearch = apiParams.size > 0;
  const [response, facetResponse] = await Promise.all([
    fetch(apiBaseUrl + '/public/articles?' + apiParams.toString(), { cache: 'no-store' }),
    fetch(apiBaseUrl + '/public/search-facets', { cache: 'no-store' }),
  ]);
  if (!response.ok || !facetResponse.ok)
    throw new Error('Public article search could not be loaded.');
  const results = hasSearch ? ((await response.json()) as Result[]) : [];
  const facets = (await facetResponse.json()) as Facets;
  return (
    <PublicPage>
      <main id={'main-content'} className={'search-page'}>
        <header className={'page-intro'}>
          <p className={'eyebrow'}>Penemuan ilmiah</p>
          <h1>Cari artikel</h1>
          <p className={'lede'}>
            Cari judul, abstrak, penulis, afiliasi, DOI, tahun, atau kata kunci dari artikel yang
            benar-benar telah dipublikasikan.
          </p>
        </header>
        <form action={'/search'} method={'get'} role={'search'} className={'search-form'}>
          <label htmlFor={'search-query'}>Kata pencarian</label>
          <div>
            <input id={'search-query'} name={'q'} type={'search'} defaultValue={query} />
            <button type={'submit'}>Cari artikel</button>
          </div>
          <fieldset className={'search-filters'}>
            <legend>Filter publikasi</legend>
            <label>
              Jurnal
              <select name={'journal'} defaultValue={params.journal ?? ''}>
                <option value={''}>Semua jurnal</option>
                {facets.journals.map((journal) => (
                  <option key={journal.slug} value={journal.slug}>
                    {journal.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bagian
              <select name={'section'} defaultValue={params.section ?? ''}>
                <option value={''}>Semua bagian</option>
                {facets.sections.map((section) => (
                  <option key={section.journal.title + section.slug} value={section.slug}>
                    {section.title} — {section.journal.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipe artikel
              <select name={'articleType'} defaultValue={params.articleType ?? ''}>
                <option value={''}>Semua tipe</option>
                {facets.articleTypes.map((articleType) => (
                  <option
                    key={articleType.journal.title + articleType.slug}
                    value={articleType.slug}
                  >
                    {articleType.title} — {articleType.journal.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Edisi
              <select name={'issue'} defaultValue={params.issue ?? ''}>
                <option value={''}>Semua edisi</option>
                {facets.issues.map((issue) => (
                  <option key={issue.journal.title + issue.slug} value={issue.slug}>
                    Vol. {issue.volume} No. {issue.number} ({issue.year}) — {issue.journal.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tahun
              <input
                name={'year'}
                type={'number'}
                min={'1900'}
                max={'2200'}
                defaultValue={params.year}
              />
            </label>
          </fieldset>
          {hasSearch ? <Link href={'/search'}>Bersihkan pencarian dan filter</Link> : null}
        </form>
        <section
          aria-live={'polite'}
          aria-labelledby={'search-results-heading'}
          className={'search-results'}
        >
          <div className={'section-heading'}>
            <h2 id={'search-results-heading'}>Hasil pencarian</h2>
            <p>
              {hasSearch
                ? results.length + (query ? ' hasil untuk “' + query + '”' : ' hasil terfilter')
                : 'Masukkan kata pencarian untuk memulai.'}
            </p>
          </div>
          {hasSearch && !results.length ? (
            <div className={'empty-state'}>
              <h3>Tidak ada artikel yang cocok</h3>
              <p>Coba gunakan judul yang lebih singkat, nama penulis, atau kata kunci lain.</p>
            </div>
          ) : null}
          {results.map((item) => {
            const version = item.versions[0];
            return version ? (
              <article className={'article-result'} key={item.id}>
                <p>
                  {item.journal.title} ·{' '}
                  {item.issue?.year ?? new Date(item.publishedAt).getFullYear()}
                </p>
                <h3>
                  <Link href={'/journals/' + item.journal.slug + '/articles/' + item.slug}>
                    {version.title}
                  </Link>
                </h3>
                <p>{names(version.authors)}</p>
                <span>{version.keywords.join(' · ')}</span>
              </article>
            ) : null;
          })}
        </section>
      </main>
    </PublicPage>
  );
}
