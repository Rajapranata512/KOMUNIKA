import { PublicPage } from '../../components/public-chrome';

export const metadata = {
  title: 'Pencarian Artikel | Aksara',
  description: 'Cari artikel ilmiah yang telah dipublikasikan melalui Aksara Journal Platform.',
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

const demonstrationArticles = [
  {
    title: 'Kerangka Audit untuk Model Prediktif pada Layanan Publik Digital',
    authors: 'Nadia Pramesti · Bima Ardiansyah',
    journal: 'Jurnal Cakrawala Data dan Teknologi',
    year: '2026',
    keywords: 'audit model prediktif layanan publik digital',
  },
  {
    title: 'Kualitas Metadata pada Repositori Riset Institusi Pendidikan Tinggi',
    authors: 'Raka Mahendra · Intan Wulandari',
    journal: 'Jurnal Cakrawala Data dan Teknologi',
    year: '2026',
    keywords: 'metadata repositori riset pendidikan tinggi',
  },
] as const;

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = (await searchParams).q?.trim() ?? '';
  const normalizedQuery = query.toLocaleLowerCase('id');
  const results = query
    ? demonstrationArticles.filter((article) =>
        `${article.title} ${article.authors} ${article.keywords}`
          .toLocaleLowerCase('id')
          .includes(normalizedQuery),
      )
    : [];

  return (
    <PublicPage>
      <main id="main-content" className="search-page">
        <header className="page-intro">
          <p className="eyebrow">Penemuan ilmiah</p>
          <h1>Cari artikel</h1>
          <p className="lede">Cari berdasarkan judul, penulis, atau kata kunci.</p>
        </header>

        <form action="/search" method="get" role="search" className="search-form">
          <label htmlFor="search-query">Kata pencarian</label>
          <div>
            <input id="search-query" name="q" type="search" defaultValue={query} />
            <button type="submit">Cari artikel</button>
          </div>
        </form>

        <section
          aria-live="polite"
          aria-labelledby="search-results-heading"
          className="search-results"
        >
          <div className="section-heading">
            <h2 id="search-results-heading">Hasil pencarian</h2>
            <p>
              {query
                ? `${results.length} hasil untuk “${query}”`
                : 'Masukkan kata pencarian untuk memulai.'}
            </p>
          </div>
          {query && results.length === 0 ? (
            <div className="empty-state">
              <h3>Tidak ada artikel yang cocok</h3>
              <p>Coba gunakan judul yang lebih singkat, nama penulis, atau kata kunci lain.</p>
            </div>
          ) : null}
          {results.map((article) => (
            <article className="article-result" key={article.title}>
              <p>
                {article.journal} · {article.year}
              </p>
              <h3>{article.title}</h3>
              <p>{article.authors}</p>
              <span>Metadata demonstrasi — halaman artikel belum dipublikasikan.</span>
            </article>
          ))}
        </section>
      </main>
    </PublicPage>
  );
}
