import { PublicPage } from '../components/public-chrome';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
interface Article {
  id: string;
  slug: string;
  publishedAt: string;
  journal: { slug: string; title: string };
  versions: Array<{
    title: string;
    authors: Array<{ name?: string; givenName?: string; familyName?: string }>;
  }>;
}

export default async function HomePage() {
  const response = await fetch(apiBaseUrl + '/public/articles', { cache: 'no-store' });
  const articles = response.ok ? ((await response.json()) as Article[]).slice(0, 5) : [];
  return (
    <PublicPage>
      <main id="main-content">
        <section className="masthead" aria-labelledby="platform-heading">
          <p className="eyebrow">Aksara Nusa Global Publishing</p>
          <h1 id="platform-heading">
            Kelola penerbitan jurnal dengan proses yang dapat ditelusuri.
          </h1>
          <p className="lede">
            ANG Publishing membantu penulis, reviewer, dan editor menjalankan alur publikasi ilmiah
            secara tertib tanpa menggantikan pertimbangan editorial manusia.
          </p>
          <div className="actions">
            <a className="primary-action" href="/journals">
              Jelajahi jurnal
            </a>
            <a className="secondary-action" href="/login">
              Masuk ke workspace
            </a>
          </div>
        </section>
        <section className="foundation-note" aria-labelledby="foundation-heading">
          <h2 id="foundation-heading">Artikel terbaru</h2>
          {articles.length ? (
            <ol className={'editorial-record-list'}>
              {articles.map((article) => {
                const version = article.versions[0];
                return version ? (
                  <li key={article.id}>
                    <Link href={'/journals/' + article.journal.slug + '/articles/' + article.slug}>
                      <strong>{version.title}</strong>
                    </Link>
                    <span>
                      {article.journal.title} ·{' '}
                      {new Date(article.publishedAt).toLocaleDateString('id-ID')}
                    </span>
                  </li>
                ) : null;
              })}
            </ol>
          ) : (
            <p>
              Belum ada artikel yang dipublikasikan. Daftar jurnal dan kebijakan tetap dapat
              dijelajahi.
            </p>
          )}
        </section>
      </main>
    </PublicPage>
  );
}
