import { BrandMark } from '../../components/public-chrome';

interface LoginPageProps {
  searchParams: Promise<{ error?: string; verified?: string; reset?: string; registered?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, verified, reset, registered } = await searchParams;
  return (
    <main id={'main-content'} className={'auth-shell auth-experience'}>
      <aside className={'auth-context'} aria-labelledby={'login-context-heading'}>
        <BrandMark priority />
        <p className={'eyebrow'}>Portal penerbitan ilmiah</p>
        <h2 id={'login-context-heading'}>Kembali ke ruang kerja editorial Anda.</h2>
        <p>
          Satu akun menghubungkan penulis, reviewer, editor, dan pengelola jurnal ke ruang kerja
          sesuai izin masing-masing.
        </p>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Satu pintu masuk</strong>
              <small>Sistem mengarahkan Anda ke workspace berdasarkan peran dan penugasan.</small>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Progres tetap terlihat</strong>
              <small>Pantau Waiting, Reviewed, Evaluation, dan Accepted dari akun penulis.</small>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Akses terjaga</strong>
              <small>Naskah privat dan keputusan editorial dibatasi berdasarkan otorisasi.</small>
            </div>
          </li>
        </ol>
      </aside>
      <section className={'auth-panel'} aria-labelledby={'login-heading'}>
        <p className={'eyebrow'}>Akun ANG Publishing</p>
        <h1 id={'login-heading'}>Masuk</h1>
        <p className={'lede'}>Gunakan email dan password akun Anda untuk melanjutkan.</p>
        {error ? (
          <div className={'form-error'} role={'alert'}>
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
        {registered ? (
          <div className={'form-success'} role={'status'}>
            Akun berhasil dibuat. Anda dapat masuk dan menyiapkan draf sekarang; verifikasi email
            diperlukan sebelum mengirim naskah.
          </div>
        ) : null}
        <form action={'/auth/login'} method={'post'} className={'auth-form'}>
          <label htmlFor={'email'}>Email</label>
          <input
            id={'email'}
            name={'email'}
            type={'email'}
            autoComplete={'username'}
            placeholder={'nama@institusi.ac.id'}
            required
          />
          <label htmlFor={'password'}>Password</label>
          <input
            id={'password'}
            name={'password'}
            type={'password'}
            autoComplete={'current-password'}
            required
          />
          <button type={'submit'}>Masuk ke workspace</button>
        </form>
        <p className={'auth-links'}>
          <a href={'/register'}>Buat akun</a>
          <a href={'/forgot-password'}>Lupa password?</a>
        </p>
        <a href={'/'}>Kembali ke situs publik</a>
      </section>
    </main>
  );
}
