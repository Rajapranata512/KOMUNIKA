import type { Metadata } from 'next';
import { IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';
import type { ReactNode } from 'react';

import '@aksara/ui/styles.css';
import './site.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600'],
});

const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: {
    default: 'Aksara Nusa Global Publishing',
    template: '%s | ANG Publishing',
  },
  description: 'Infrastruktur penerbitan jurnal ilmiah Aksara Nusa Global Publishing.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Lewati ke konten utama
        </a>
        {children}
      </body>
    </html>
  );
}
