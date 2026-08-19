interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token, error } = await searchParams;
  return (
    <main id={'main-content'} className={'auth-shell'}>
      <section className={'auth-panel'} aria-labelledby={'verify-heading'}>
        <p className={'eyebrow'}>Verifikasi email</p>
        <h1 id={'verify-heading'}>{token ? 'Aktifkan akun' : 'Periksa email Anda'}</h1>
        <p className={'lede'}>
          {token
            ? 'Mode lokal menyediakan token pengembangan agar alur dapat diuji tanpa mengklaim pengiriman email.'
            : 'Permintaan verifikasi telah dibuat dan menunggu layanan pengiriman email.'}
        </p>
        {error ? (
          <div className={'form-error'} role={'alert'}>
            Token tidak valid atau telah kedaluwarsa.
          </div>
        ) : null}
        {token ? (
          <form action={'/auth/verify-email'} method={'post'} className={'auth-form'}>
            <input type={'hidden'} name={'token'} value={token} />
            <button type={'submit'}>Verifikasi email</button>
          </form>
        ) : null}
        <a href={'/login'}>Kembali ke halaman masuk</a>
      </section>
    </main>
  );
}
