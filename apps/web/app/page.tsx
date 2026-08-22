import Link from 'next/link';

import { PublicPage } from '../components/public-chrome';

export const dynamic = 'force-dynamic';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface Article {
  id: string;
  slug: string;
  publishedAt: string;
  journal: { slug: string; title: string };
  issue?: { volume: string; number: string; year: number } | null;
  versions: Array<{ title: string; authors: Array<{ name?: string }> }>;
}

interface Journal {
  id: string;
  slug: string;
  title: string;
  abbreviation: string;
  description: string;
  submissionsOpen: boolean;
}

export default async function HomePage() {
  const [articlesResponse, journalsResponse] = await Promise.allSettled([
    fetch(apiBaseUrl + '/public/articles', { cache: 'no-store' }),
    fetch(apiBaseUrl + '/journals', { cache: 'no-store' }),
  ]);
  const articles =
    articlesResponse.status === 'fulfilled' && articlesResponse.value.ok
      ? ((await articlesResponse.value.json()) as Article[]).slice(0, 6)
      : [];
  const journals =
    journalsResponse.status === 'fulfilled' && journalsResponse.value.ok
      ? ((await journalsResponse.value.json()) as Journal[]).slice(0, 3)
      : [];

  return (
    <PublicPage>
      <main id={'main-content'} className={'home-page'}>
        <section className={'home-hero'} aria-labelledby={'platform-heading'}>
          <div className={'home-hero-copy'}>
            <p className={'eyebrow'}>Aksara Nusa Global Publishing</p>
            <h1 id={'platform-heading'}>
              Naskah ilmiah, dikelola melalui proses editorial yang jelas.
            </h1>
            <p className={'lede'}>
              Satu ruang kerja untuk menyiapkan naskah, mengikuti penelaahan, merespons evaluasi,
              dan memantau publikasi—dengan keputusan akhir tetap berada pada editor.
            </p>
            <div className={'actions'}>
              <Link className={'primary-action'} href={'/register'}>
                Mulai submission
              </Link>
              <Link className={'secondary-action'} href={'/journals'}>
                Jelajahi jurnal
              </Link>
            </div>
          </div>
          <aside className={'workflow-preview'} aria-label={'Ringkasan alur naskah'}>
            <p className={'eyebrow'}>Alur yang dapat dipantau</p>
            <ol>
              {['Waiting', 'Reviewed', 'Evaluation', 'Accepted'].map((phase, index) => (
                <li key={phase}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{phase}</strong>
                    <small>
                      {
                        [
                          'Naskah diterima sistem',
                          'Penelaahan oleh reviewer',
                          'Keputusan dan revisi',
                          'Masuk tahap produksi',
                        ][index]
                      }
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        <section className={'home-section'} aria-labelledby={'latest-heading'}>
          <div className={'section-heading-row'}>
            <div>
              <p className={'eyebrow'}>Terbitan ilmiah</p>
              <h2 id={'latest-heading'}>Artikel terbaru</h2>
            </div>
            <Link href={'/search'}>Lihat semua artikel</Link>
          </div>
          {articles.length ? (
            <div className={'home-article-grid'}>
              {articles.map((article) => {
                const version = article.versions[0];
                if (!version) return null;
                return (
                  <article key={article.id}>
                    <p className={'article-context'}>
                      {article.issue
                        ? `Vol. ${article.issue.volume} No. ${article.issue.number} · ${article.issue.year}`
                        : article.journal.title}
                    </p>
                    <h3>
                      <Link href={`/journals/${article.journal.slug}/articles/${article.slug}`}>
                        {version.title}
                      </Link>
                    </h3>
                    <p>
                      {version.authors
                        .map(({ name }) => name)
                        .filter(Boolean)
                        .join(', ') || 'Tim penulis'}
                    </p>
                    <time dateTime={article.publishedAt}>
                      {new Date(article.publishedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </time>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={'empty-state'}>
              <h3>Arsip publikasi sedang disiapkan</h3>
              <p>Jurnal dan kebijakan editorial tetap dapat dijelajahi.</p>
            </div>
          )}
        </section>

        <section className={'home-section home-journals'} aria-labelledby={'journals-heading'}>
          <div>
            <p className={'eyebrow'}>Direktori</p>
            <h2 id={'journals-heading'}>Jurnal yang menerima naskah</h2>
            <p>
              Setiap jurnal memiliki ruang lingkup, kebijakan review, dan jadwal terbit yang
              transparan.
            </p>
          </div>
          <div className={'journal-preview-list'}>
            {journals.length ? (
              journals.map((journal) => (
                <article key={journal.id}>
                  <span>{journal.abbreviation}</span>
                  <div>
                    <h3>
                      <Link href={`/journals/${journal.slug}`}>{journal.title}</Link>
                    </h3>
                    <p>{journal.description}</p>
                  </div>
                  <strong>
                    {journal.submissionsOpen ? 'Submission dibuka' : 'Submission ditutup'}
                  </strong>
                </article>
              ))
            ) : (
              <p>Belum ada jurnal yang dipublikasikan.</p>
            )}
          </div>
        </section>

        <section className={'publishing-principles'} aria-label={'Prinsip penerbitan'}>
          <div>
            <strong>Integritas editorial</strong>
            <span>Keputusan manusia, riwayat tindakan, dan akses berbasis peran.</span>
          </div>
          <div>
            <strong>Review terstruktur</strong>
            <span>Identitas dan berkas privat dijaga sesuai model review jurnal.</span>
          </div>
          <div>
            <strong>Arsip terpercaya</strong>
            <span>Hanya rekam publikasi yang telah disetujui tampil di situs publik.</span>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
