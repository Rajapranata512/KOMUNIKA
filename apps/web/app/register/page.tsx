import { BrandMark } from '../../components/public-chrome';

interface RegisterPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error } = await searchParams;
  return (
    <main id={'main-content'} className={'auth-shell auth-experience'}>
      <aside className={'auth-context'}>
        <BrandMark priority />
        <p className={'eyebrow'}>Ruang kerja penulis</p>
        <h1>Mulai perjalanan publikasi Anda.</h1>
        <p>
          Buat akun untuk menyiapkan draf dan melihat alur kerja. Verifikasi email baru diperlukan
          saat naskah benar-benar dikirim.
        </p>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Siapkan naskah</strong>
              <small>Lengkapi metadata, penulis, dan berkas secara bertahap.</small>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Ikuti progres</strong>
              <small>Pantau Waiting, Reviewed, Evaluation, hingga Accepted.</small>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Tanggapi editor</strong>
              <small>Revisi dan keputusan tersimpan dalam riwayat naskah.</small>
            </div>
          </li>
        </ol>
      </aside>
      <section className={'auth-panel'} aria-labelledby={'register-heading'}>
        <p className={'eyebrow'}>Akun ANG Publishing</p>
        <h2 id={'register-heading'}>Buat akun</h2>
        <p className={'lede'}>
          Gunakan email yang nantinya dapat Anda verifikasi sebelum mengirim naskah.
        </p>
        {error ? (
          <div className={'form-error'} role={'alert'}>
            Pendaftaran gagal. Email mungkin sudah digunakan atau password belum memenuhi ketentuan.
          </div>
        ) : null}
        <form action={'/auth/register'} method={'post'} className={'auth-form'}>
          <label htmlFor={'email'}>Email</label>
          <input
            id={'email'}
            name={'email'}
            type={'email'}
            autoComplete={'email'}
            placeholder={'nama@institusi.ac.id'}
            required
          />
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
          <button type={'submit'}>Buat akun penulis</button>
        </form>
        <p className={'auth-switch'}>
          Sudah memiliki akun? <a href={'/login'}>Masuk</a>
        </p>
        <a href={'/'}>Kembali ke situs publik</a>
      </section>
    </main>
  );
}
