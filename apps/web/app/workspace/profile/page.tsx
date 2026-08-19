import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface ProfilePageProps {
  searchParams: Promise<{ saved?: string; error?: string }>;
}

interface Profile {
  email: string;
  emailVerifiedAt: string | null;
  fullName: string | null;
  affiliation: string | null;
  countryCode: string | null;
  expertise: string[];
  orcidId: string | null;
  locale: string;
  timezone: string;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const { saved, error } = await searchParams;
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/users/me/profile`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Profile could not be loaded.');
  const profile = (await response.json()) as Profile;
  return (
    <main id={'main-content'} className={'admin-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>Ruang kerja</p>
          <h1>Profil</h1>
          <p>{profile.email}</p>
        </div>
        <form action={'/auth/logout'} method={'post'}>
          <button className={'secondary-button'} type={'submit'}>
            Keluar
          </button>
        </form>
      </header>
      <section className={'admin-next'} aria-labelledby={'profile-heading'}>
        <h2 id={'profile-heading'}>Identitas akademik</h2>
        {saved ? (
          <div className={'form-success'} role={'status'}>
            Profil berhasil disimpan.
          </div>
        ) : null}
        {error ? (
          <div className={'form-error'} role={'alert'}>
            Profil tidak dapat disimpan. Periksa kembali data Anda.
          </div>
        ) : null}
        <form action={'/auth/profile'} method={'post'} className={'auth-form'}>
          <label htmlFor={'fullName'}>Nama lengkap</label>
          <input id={'fullName'} name={'fullName'} defaultValue={profile.fullName ?? ''} required />
          <label htmlFor={'affiliation'}>Afiliasi</label>
          <input id={'affiliation'} name={'affiliation'} defaultValue={profile.affiliation ?? ''} />
          <label htmlFor={'countryCode'}>Kode negara</label>
          <input
            id={'countryCode'}
            name={'countryCode'}
            defaultValue={profile.countryCode ?? ''}
            maxLength={2}
            placeholder={'ID'}
          />
          <label htmlFor={'expertise'}>Bidang keahlian</label>
          <textarea
            id={'expertise'}
            name={'expertise'}
            defaultValue={profile.expertise.join(', ')}
          />
          <p className={'field-help'}>Pisahkan bidang keahlian dengan koma.</p>
          <label htmlFor={'orcidId'}>ORCID iD</label>
          <input
            id={'orcidId'}
            name={'orcidId'}
            defaultValue={profile.orcidId ?? ''}
            placeholder={'0000-0000-0000-0000'}
          />
          <p className={'field-help'}>
            ORCID ini merupakan isian pengguna dan belum diverifikasi melalui OAuth.
          </p>
          <label htmlFor={'locale'}>Locale</label>
          <input id={'locale'} name={'locale'} defaultValue={profile.locale} required />
          <label htmlFor={'timezone'}>Zona waktu</label>
          <input id={'timezone'} name={'timezone'} defaultValue={profile.timezone} required />
          <button type={'submit'}>Simpan profil</button>
        </form>
      </section>
    </main>
  );
}
