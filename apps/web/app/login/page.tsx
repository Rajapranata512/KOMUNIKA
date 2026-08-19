interface LoginPageProps {
  searchParams: Promise<{ error?: string; verified?: string; reset?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, verified, reset } = await searchParams;
  return (
    <main id="main-content" className="auth-shell">
      <section className="auth-panel" aria-labelledby="login-heading">
        <p className="eyebrow">Akun Aksara</p>
        <h1 id="login-heading">Masuk</h1>
        <p className="lede">Gunakan email dan password akun Anda.</p>
        {error ? (
          <div className="form-error" role="alert">
            Email atau password tidak valid. Periksa kembali kredensial Anda.
          </div>
        ) : null}
        {verified ? (
          <div className={'form-success'} role={'status'}>
            Email berhasil diverifikasi. Silakan masuk.
          </div>
        ) : null}
        {reset ? (
          <div className={'form-success'} role={'status'}>
            Password berhasil diperbarui. Silakan masuk.
          </div>
        ) : null}
        <form action="/auth/login" method="post" className="auth-form">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button type="submit">Masuk</button>
        </form>
        <p className={'auth-links'}>
          <a href={'/register'}>Buat akun</a>
          <a href={'/forgot-password'}>Lupa password?</a>
        </p>
        <a href="/">Kembali ke situs publik</a>
      </section>
    </main>
  );
}
