import type { ReactNode } from 'react';

export function PublicHeader() {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Beranda Aksara Journal Platform">
        Aksara
      </a>
      <nav aria-label="Navigasi utama">
        <a href="/journals">Jurnal</a>
        <a href="/search">Pencarian</a>
        <a href="/login">Masuk</a>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer>
      <span>© 2026 Aksara Journal Platform</span>
      <span>Metadata demonstrasi bersifat fiktif.</span>
    </footer>
  );
}

export function PublicPage({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <PublicHeader />
      {children}
      <PublicFooter />
    </>
  );
}
