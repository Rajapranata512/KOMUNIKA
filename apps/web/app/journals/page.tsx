import { PublicPage } from '../../components/public-chrome';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Daftar Jurnal',
  description: 'Jelajahi jurnal ilmiah yang dikelola oleh Aksara Nusa Global Publishing.',
};

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface PublicJournal {
  id: string;
  slug: string;
  title: string;
  abbreviation: string;
  description: string;
  primaryLanguage: string;
  reviewModel: 'SINGLE_ANONYMOUS' | 'DOUBLE_ANONYMOUS';
  submissionsOpen: boolean;
}

export default async function JournalsPage() {
  let journals: PublicJournal[] = [];
  let directoryUnavailable = false;
  try {
    const response = await fetch(`${apiBaseUrl}/journals`, { cache: 'no-store' });
    if (response.ok) journals = (await response.json()) as PublicJournal[];
    else directoryUnavailable = true;
  } catch {
    directoryUnavailable = true;
  }
  return (
    <PublicPage>
      <main id={'main-content'} className={'public-list-page'}>
        <header className={'page-intro'}>
          <p className={'eyebrow'}>Direktori penerbitan</p>
          <h1>Jurnal</h1>
          <p className={'lede'}>
            Temukan ruang publikasi berdasarkan bidang kajian dan kebijakan editorialnya.
          </p>
        </header>
        <section aria-labelledby={'journal-list-heading'} className={'catalog-section'}>
          <div className={'section-heading'}>
            <h2 id={'journal-list-heading'}>Jurnal yang tersedia</h2>
            <p>{journals.length} jurnal</p>
          </div>
          {directoryUnavailable ? (
            <div className={'empty-state'} role={'status'}>
              <h3>Direktori jurnal sedang tidak tersedia</h3>
              <p>
                Layanan data jurnal belum terhubung. Silakan coba kembali setelah konfigurasi
                layanan selesai.
              </p>
            </div>
          ) : journals.length ? (
            journals.map((journal) => (
              <article className={'journal-row'} key={journal.id}>
                <div>
                  <p className={'journal-abbreviation'}>{journal.abbreviation}</p>
                  <h3>
                    <a href={`/journals/${journal.slug}`}>{journal.title}</a>
                  </h3>
                  <p>{journal.description}</p>
                </div>
                <dl className={'journal-metadata'}>
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
                    <dt>Pengajuan naskah</dt>
                    <dd>{journal.submissionsOpen ? 'Dibuka' : 'Ditutup'}</dd>
                  </div>
                  <div>
                    <dt>Status indeksasi</dt>
                    <dd>Tidak diklaim</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <div className={'empty-state'}>
              <h3>Belum ada jurnal yang dipublikasikan</h3>
              <p>Direktori akan terisi setelah konfigurasi jurnal ditinjau dan dipublikasikan.</p>
            </div>
          )}
        </section>
      </main>
    </PublicPage>
  );
}
