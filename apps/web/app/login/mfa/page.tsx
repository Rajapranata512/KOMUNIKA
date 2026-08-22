import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { IdentityContext } from '../../../components/identity-context';

export default async function MfaLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await cookies()).get('aksara_mfa_challenge')) redirect('/login');
  const { error } = await searchParams;
  return (
    <main id="main-content" className="auth-shell auth-experience">
      <IdentityContext
        eyebrow={'Perlindungan administrator'}
        heading={'Konfirmasi lapisan keamanan kedua.'}
        description={
          'Akses administratif memerlukan bukti tambahan setelah email dan password berhasil diperiksa.'
        }
        headingId={'mfa-context-heading'}
        items={[
          {
            title: 'Kode berbatas waktu',
            detail: 'Gunakan enam digit yang sedang aktif di aplikasi autentikator.',
          },
          {
            title: 'Challenge sekali pakai',
            detail: 'Permintaan login berakhir otomatis dan memiliki batas percobaan.',
          },
          {
            title: 'Aktivitas diaudit',
            detail: 'Autentikasi administrator dicatat tanpa menyimpan kode rahasia.',
          },
        ]}
      />
      <section className="auth-panel" aria-labelledby="mfa-heading">
        <p className="eyebrow">Keamanan administrator</p>
        <h1 id="mfa-heading">Masukkan kode autentikator</h1>
        <p className="lede">
          Gunakan kode enam digit yang sedang aktif di aplikasi autentikator Anda.
        </p>
        {error ? (
          <div className="form-error" role="alert">
            Kode tidak valid atau challenge telah kedaluwarsa. Masuk kembali untuk mencoba ulang.
          </div>
        ) : null}
        <form action="/auth/mfa-verify" method="post" className="auth-form">
          <label htmlFor="code">Kode enam digit</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            autoFocus
          />
          <button type="submit">Verifikasi dan masuk</button>
        </form>
        <a href="/login">Kembali ke login</a>
      </section>
    </main>
  );
}
