'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { href: '/admin', label: 'Ringkasan', description: 'Status platform' },
  { href: '/admin/journals', label: 'Jurnal & CMS', description: 'Konten dan konfigurasi' },
  { href: '/admin/users', label: 'Pengguna', description: 'Akun dan akses' },
  { href: '/admin/security', label: 'Keamanan', description: 'MFA administrator' },
] as const;

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav className="cms-navigation" aria-label="Navigasi administrasi">
      {navigation.map((item, index) => {
        const active =
          item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
            <span className="cms-nav-index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
