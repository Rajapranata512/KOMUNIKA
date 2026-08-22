import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AdminNavigation } from '../../components/admin-navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const response = await fetch(apiBaseUrl + '/admin/overview', {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Administration workspace could not be loaded.');
  const overview = (await response.json()) as { administrator: { email: string } };

  return (
    <div className="cms-shell">
      <aside className="cms-sidebar">
        <Link className="cms-brand" href="/admin" aria-label="Beranda administrasi ANG Publishing">
          <Image src="/ang-publishing-logo.png" alt="" width={2130} height={720} priority />
        </Link>
        <div className="cms-context">
          <span>Ruang kerja</span>
          <strong>Administrasi penerbitan</strong>
        </div>
        <AdminNavigation />
        <div className="cms-sidebar-footer">
          <span>Platform administrator</span>
          <small>Perubahan istimewa dicatat dalam audit.</small>
        </div>
      </aside>

      <div className="cms-workspace">
        <header className="cms-topbar">
          <details className="cms-mobile-menu">
            <summary>Menu administrasi</summary>
            <AdminNavigation />
          </details>
          <div className="cms-account">
            <span>Masuk sebagai</span>
            <strong>{overview.administrator.email}</strong>
          </div>
          <div className="cms-topbar-actions">
            <Link href="/">Lihat situs publik</Link>
            <form action="/auth/logout" method="post">
              <button className="secondary-button" type="submit">
                Keluar
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
