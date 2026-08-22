interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token, error } = await searchParams;
  return (
    <main id={'main-content'} className={'auth-shell auth-experience'}>
      <IdentityContext
        eyebrow={'Identitas penulis'}
        heading={'Konfirmasi email sebelum naskah dikirim.'}
        description={
          'Anda tetap dapat masuk dan menyiapkan draf. Verifikasi memastikan alamat korespondensi valid sebelum submission final diterima editor.'
        }
        headingId={'verify-context-heading'}
        items={[
          {
            title: 'Draf tetap tersedia',
            detail: 'Masuk dan lengkapi metadata tanpa menunggu verifikasi.',
          },
          {
            title: 'Korespondensi jelas',
            detail: 'Editor menggunakan alamat terverifikasi untuk komunikasi naskah.',
          },
          {
            title: 'Pengiriman terlindungi',
            detail: 'Submission final baru dibuka setelah kepemilikan email dikonfirmasi.',
          },
        ]}
      />
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
import { IdentityContext } from '../../components/identity-context';
