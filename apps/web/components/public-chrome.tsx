import Image from 'next/image';
import type { ReactNode } from 'react';

export function BrandMark({ priority = false }: Readonly<{ priority?: boolean }>) {
  return (
    <a className="brand-lockup" href="/" aria-label="Beranda Aksara Nusa Global Publishing">
      <Image
        className="brand-logo"
        src="/ang-publishing-logo.png"
        alt=""
        width={2130}
        height={720}
        priority={priority}
      />
    </a>
  );
}

export function PublicHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <BrandMark priority />
        <nav aria-label="Navigasi utama">
          <a href="/journals">Jurnal</a>
          <a href="/search">Pencarian</a>
          <a href="/login">Masuk</a>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer>
      <span>Copyright 2026 Aksara Nusa Global Publishing</span>
      <span className="publisher-values">Knowledge | Integrity | Impact | International</span>
      <span>Metadata publik hanya berasal dari rekam publikasi yang telah disetujui.</span>
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
