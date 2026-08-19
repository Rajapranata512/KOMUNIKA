import { PublicPage } from '../components/public-chrome';

export default function HomePage() {
  return (
    <PublicPage>
      <main id="main-content">
        <section className="masthead" aria-labelledby="platform-heading">
          <p className="eyebrow">Infrastruktur penerbitan ilmiah</p>
          <h1 id="platform-heading">
            Kelola penerbitan jurnal dengan proses yang dapat ditelusuri.
          </h1>
          <p className="lede">
            Aksara membantu penulis, reviewer, dan editor menjalankan alur publikasi ilmiah secara
            tertib tanpa menggantikan pertimbangan editorial manusia.
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
          <h2 id="foundation-heading">Fondasi platform sedang disiapkan</h2>
          <p>
            Konten publik demonstrasi ditampilkan secara jelas dan tidak menyatakan indeksasi,
            akreditasi, atau DOI yang belum diverifikasi.
          </p>
        </section>
      </main>
    </PublicPage>
  );
}
