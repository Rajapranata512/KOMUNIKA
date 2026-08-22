import { IdentityContext } from '../../components/identity-context';

interface RegisterPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error } = await searchParams;
  return (
    <main id={'main-content'} className={'auth-shell auth-experience'}>
      <IdentityContext
        eyebrow={'Ruang kerja penulis'}
        heading={'Mulai perjalanan publikasi Anda.'}
        description={
          'Buat akun untuk menyiapkan draf dan melihat alur kerja. Verifikasi email baru diperlukan saat naskah benar-benar dikirim.'
        }
        headingId={'register-context-heading'}
        headingLevel={'h1'}
        items={[
          {
            title: 'Siapkan naskah',
            detail: 'Lengkapi metadata, penulis, dan berkas secara bertahap.',
          },
          {
            title: 'Ikuti progres',
            detail: 'Pantau Waiting, Reviewed, Evaluation, hingga Accepted.',
          },
          {
            title: 'Tanggapi editor',
            detail: 'Revisi dan keputusan tersimpan dalam riwayat naskah.',
          },
        ]}
      />
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
