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
      <section aria-labelledby="cms-modules-heading">
        <div className="section-heading cms-section-heading">
          <div>
            <p className="eyebrow">Modul CMS</p>
            <h2 id="cms-modules-heading">Kelola kebutuhan penerbitan</h2>
          </div>
          <p>Semua tindakan tetap dibatasi oleh role dan tenant.</p>
        </div>
        <div className="cms-module-grid">
          <article className="cms-module-card">
            <span className="cms-module-number" aria-hidden="true">
              01
            </span>
            <div>
              <h3>Jurnal dan konten</h3>
              <p>
                Identitas jurnal, tim editorial, seksi, jenis artikel, checklist, dan kebijakan.
              </p>
              <ul>
                <li>Template dan deklarasi berversi</li>
                <li>Form peer review per seksi</li>
                <li>Status publikasi dan pengajuan</li>
              </ul>
            </div>
            <a className="primary-action" href="/admin/journals">
              Buka jurnal & CMS
            </a>
          </article>
          <article className="cms-module-card">
            <span className="cms-module-number" aria-hidden="true">
              02
            </span>
            <div>
              <h3>Pengguna dan akses</h3>
              <p>Tinjau akun, verifikasi, keanggotaan jurnal, sesi, dan status akses pengguna.</p>
              <ul>
                <li>Pencarian pengguna</li>
                <li>Aktifkan atau nonaktifkan akun</li>
                <li>Perlindungan administrator terakhir</li>
              </ul>
            </div>
            <a className="secondary-action" href="/admin/users">
              Kelola pengguna
            </a>
          </article>
          <article className="cms-module-card">
            <span className="cms-module-number" aria-hidden="true">
              03
            </span>
            <div>
              <h3>Keamanan</h3>
              <p>Lindungi operasi istimewa dan tinjau sesi administrator yang masih aktif.</p>
              <ul>
                <li>Setup autentikator TOTP</li>
                <li>Cabut sesi aktif</li>
                <li>Audit login dan perubahan</li>
              </ul>
            </div>
            <a className="secondary-action" href="/admin/security">
              Atur keamanan
            </a>
          </article>
        </div>
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
    </main>
  );
}
