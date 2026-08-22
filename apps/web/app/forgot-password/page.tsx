interface ForgotPasswordPageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { token, error } = await searchParams;
  return (
    <main id={'main-content'} className={'auth-shell auth-experience'}>
      <IdentityContext
        eyebrow={'Pemulihan akun'}
        heading={
          token
            ? 'Tetapkan ulang akses Anda dengan aman.'
            : 'Kembali ke ruang kerja tanpa membuka informasi akun.'
        }
        description={
          token
            ? 'Password baru akan menggantikan kredensial lama dan mengakhiri sesi aktif lainnya.'
            : 'Proses pemulihan dirancang untuk membantu pemilik akun tanpa mengungkap apakah sebuah email terdaftar.'
        }
        headingId={'reset-context-heading'}
        items={[
          {
            title: 'Respons privat',
            detail: 'Sistem memberikan respons yang sama untuk setiap alamat email.',
          },
          {
            title: 'Token sekali pakai',
            detail: 'Tautan pemulihan memiliki masa berlaku dan tidak dapat digunakan kembali.',
          },
          {
            title: 'Sesi dilindungi',
            detail: 'Perubahan password mencabut sesi aktif agar akses lama tidak bertahan.',
          },
        ]}
      />
      <section className={'auth-panel'} aria-labelledby={'reset-heading'}>
        <p className={'eyebrow'}>Keamanan akun</p>
        <h1 id={'reset-heading'}>{token ? 'Buat password baru' : 'Reset password'}</h1>
        <p className={'lede'}>
          {token
            ? 'Token hanya dapat digunakan sekali dan akan membatalkan seluruh sesi aktif.'
            : 'Masukkan email akun. Respons tidak akan mengungkap apakah email terdaftar.'}
        </p>
        {error ? (
          <div className={'form-error'} role={'alert'}>
            Permintaan tidak valid atau token telah kedaluwarsa.
          </div>
        ) : null}
        <form action={'/auth/password-reset'} method={'post'} className={'auth-form'}>
          {token ? (
            <>
              <input type={'hidden'} name={'token'} value={token} />
              <label htmlFor={'password'}>Password baru</label>
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
            </>
          ) : (
            <>
              <label htmlFor={'email'}>Email</label>
              <input id={'email'} name={'email'} type={'email'} autoComplete={'email'} required />
            </>
          )}
          <button type={'submit'}>{token ? 'Perbarui password' : 'Minta reset password'}</button>
        </form>
        <a href={'/login'}>Kembali ke halaman masuk</a>
      </section>
    </main>
  );
}
import { IdentityContext } from '../../components/identity-context';
