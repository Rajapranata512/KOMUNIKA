import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface AdminOverview {
  administrator: { email: string; platformRole: 'PLATFORM_ADMIN' };
  counts: { users: number; activeSessions: number; auditEvents: number };
}

interface AdminSessions {
  sessions: Array<{
    id: string;
    lastSeenAt: string;
    current: boolean;
    user: { email: string };
  }>;
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const [response, sessionsResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/admin/overview`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    }),
    fetch(`${apiBaseUrl}/admin/sessions`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    }),
  ]);
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Admin overview could not be loaded.');
  const overview = (await response.json()) as AdminOverview;
  if (!sessionsResponse.ok) throw new Error('Active sessions could not be loaded.');
  const sessionData = (await sessionsResponse.json()) as AdminSessions;

  return (
    <main id="main-content" className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Administrasi platform</p>
          <h1>Ringkasan sistem</h1>
          <p>Masuk sebagai {overview.administrator.email}</p>
        </div>
        <form action="/auth/logout" method="post">
          <button className="secondary-button" type="submit">
            Keluar
          </button>
        </form>
      </header>
      <section aria-labelledby="system-state-heading">
        <h2 id="system-state-heading">Status faktual</h2>
        <dl className="admin-definition-list">
          <div>
            <dt>Pengguna terdaftar</dt>
            <dd>{overview.counts.users}</dd>
          </div>
          <div>
            <dt>Session aktif</dt>
            <dd>{overview.counts.activeSessions}</dd>
          </div>
          <div>
            <dt>Audit event</dt>
            <dd>{overview.counts.auditEvents}</dd>
          </div>
          <div>
            <dt>Role aktif</dt>
            <dd>Platform administrator</dd>
          </div>
        </dl>
      </section>
      <section className="admin-next" aria-labelledby="admin-next-heading">
        <h2 id="admin-next-heading">Konfigurasi berikutnya</h2>
        <p>
          <a href={'/admin/journals'}>Kelola jurnal</a> untuk identitas publik, keanggotaan, seksi,
          jenis artikel, checklist, deklarasi, dan template.
        </p>
      </section>
      <section className="admin-next" aria-labelledby="users-admin-heading">
        <h2 id="users-admin-heading">Pengguna dan akses</h2>
        <p>
          <a href="/admin/users">Kelola pengguna</a> untuk meninjau akun, status verifikasi,
          keanggotaan, dan menangguhkan akses secara teraudit.
        </p>
      </section>
      <section className="admin-next" aria-labelledby="security-admin-heading">
        <h2 id="security-admin-heading">Keamanan akun</h2>
        <p>
          <a href="/admin/security">Konfigurasi MFA</a> untuk mewajibkan kode autentikator setelah
          password administrator.
        </p>
      </section>
      <section className={'admin-next'} aria-labelledby={'sessions-heading'}>
        <h2 id={'sessions-heading'}>Sesi aktif</h2>
        {sessionData.sessions.length ? (
          <div className={'session-list'}>
            {sessionData.sessions.map((session) => (
              <article key={session.id}>
                <div>
                  <strong>{session.user.email}</strong>
                  <span>{session.current ? 'Sesi saat ini' : 'Sesi lain'}</span>
                  <small>
                    Terakhir aktif{' '}
                    {new Intl.DateTimeFormat('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Jakarta',
                    }).format(new Date(session.lastSeenAt))}
                  </small>
                </div>
                <form action={'/auth/revoke-session'} method={'post'}>
                  <input type={'hidden'} name={'sessionId'} value={session.id} />
                  <button className={'secondary-button'} type={'submit'}>
                    Cabut sesi
                  </button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <p>Tidak ada sesi aktif.</p>
        )}
      </section>
      <p className={'actions'}>
        <a className={'primary-action'} href={'/admin/journals'}>
          Kelola jurnal
        </a>
      </p>
    </main>
  );
}
