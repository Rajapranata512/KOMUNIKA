import { BrandMark } from '../../components/public-chrome';

interface RegisterPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error } = await searchParams;
  return (
    <main id={'main-content'} className={'auth-shell'}>
      <section className={'auth-panel'} aria-labelledby={'register-heading'}>
        <div className={'auth-brand'}>
          <BrandMark priority />
        </div>
        <p className={'eyebrow'}>Akun ANG Publishing</p>
        <h1 id={'register-heading'}>Buat akun</h1>
        <p className={'lede'}>Daftar dengan email aktif untuk mengelola naskah Anda.</p>
        {error ? (
          <div className={'form-error'} role={'alert'}>
            Pendaftaran gagal. Email mungkin sudah digunakan atau password belum memenuhi ketentuan.
          </div>
        ) : null}
        <form action={'/auth/register'} method={'post'} className={'auth-form'}>
          <label htmlFor={'email'}>Email</label>
          <input id={'email'} name={'email'} type={'email'} autoComplete={'email'} required />
          <label htmlFor={'password'}>Password</label>
          <input
            id={'password'}
            name={'password'}
            type={'password'}
            autoComplete={'new-password'}
            minLength={12}
            required
          />
          <p className={'field-help'}>
            Minimal 12 karakter, dengan huruf besar, huruf kecil, dan angka.
          </p>
          <button type={'submit'}>Daftar</button>
        </form>
        <a href={'/login'}>Sudah memiliki akun? Masuk</a>
      </section>
    </main>
  );
}
