import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ enabled?: string; error?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/auth/mfa`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('MFA status could not be loaded.');
  const status = (await response.json()) as { enabled: boolean };
  const setup = cookieStore.get('aksara_mfa_setup')?.value;
  let setupData: { secret: string; uri: string } | null = null;
  if (setup) {
    try {
      const parsed = JSON.parse(Buffer.from(setup, 'base64url').toString('utf8')) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'secret' in parsed &&
        typeof parsed.secret === 'string' &&
        'uri' in parsed &&
        typeof parsed.uri === 'string'
      )
        setupData = { secret: parsed.secret, uri: parsed.uri };
    } catch {
      setupData = null;
    }
  }
  return (
    <main id="main-content" className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Administrasi platform</p>
          <h1>Keamanan administrator</h1>
          <p>MFA melindungi akses istimewa setelah password diverifikasi.</p>
        </div>
        <a className="secondary-action" href="/admin">
          Kembali
        </a>
      </header>
      {params.enabled ? (
        <div className="form-success" role="status">
          MFA berhasil diaktifkan. Login administrator berikutnya membutuhkan kode autentikator.
        </div>
      ) : null}
      {params.error ? (
        <div className="form-error" role="alert">
          Kode tidak valid. Periksa waktu perangkat dan coba kembali.
        </div>
      ) : null}
      <section className="admin-next" aria-labelledby="mfa-status-heading">
        <h2 id="mfa-status-heading">Status MFA</h2>
        <p>
          {status.enabled
            ? 'Aktif — faktor kedua diwajibkan.'
            : 'Belum aktif — selesaikan setup sebelum menggunakan akun untuk operasi production.'}
        </p>
        {!status.enabled && !setupData ? (
          <form action="/auth/mfa-setup" method="post">
            <button type="submit">Mulai setup MFA</button>
          </form>
        ) : null}
      </section>
      {setupData ? (
        <section className="admin-next" aria-labelledby="mfa-setup-heading">
          <h2 id="mfa-setup-heading">Hubungkan aplikasi autentikator</h2>
          <ol>
            <li>Tambahkan akun TOTP secara manual.</li>
            <li>
              Masukkan secret berikut: <code>{setupData.secret}</code>
            </li>
            <li>Issuer: Aksara Nusa Global; periode 30 detik; enam digit.</li>
          </ol>
          <details>
            <summary>URI konfigurasi lanjutan</summary>
            <code className="breakable-code">{setupData.uri}</code>
          </details>
          <form action="/auth/mfa-confirm" method="post" className="auth-form">
            <label htmlFor="code">Kode verifikasi</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
            />
            <button type="submit">Aktifkan MFA</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
