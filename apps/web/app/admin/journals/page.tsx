import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface AdminJournal {
  id: string;
  slug: string;
  title: string;
  abbreviation: string;
  status: 'DRAFT' | 'PUBLISHED';
  reviewModel: 'SINGLE_ANONYMOUS' | 'DOUBLE_ANONYMOUS';
  _count: { memberships: number };
}

export default async function AdminJournalsPage() {
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/admin/journals`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Journal administration could not be loaded.');
  const journals = (await response.json()) as AdminJournal[];
  return (
    <main id={'main-content'} className={'admin-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>Administrasi platform</p>
          <h1>Jurnal</h1>
          <p>Konfigurasi tenant jurnal dan akses pengelolanya.</p>
        </div>
        <a className={'secondary-action'} href={'/admin'}>
          Kembali
        </a>
      </header>
      <section className={'admin-next'} aria-labelledby={'create-journal-heading'}>
        <h2 id={'create-journal-heading'}>Buat jurnal</h2>
        <form action={'/auth/create-journal'} method={'post'} className={'auth-form'}>
          <label htmlFor={'title'}>Nama jurnal</label>
          <input id={'title'} name={'title'} required minLength={3} />
          <label htmlFor={'slug'}>Slug</label>
          <input id={'slug'} name={'slug'} required pattern={'[a-z0-9]+(?:-[a-z0-9]+)*'} />
          <label htmlFor={'abbreviation'}>Singkatan</label>
          <input id={'abbreviation'} name={'abbreviation'} required />
          <label htmlFor={'description'}>Deskripsi</label>
          <textarea id={'description'} name={'description'} required minLength={20} />
          <label htmlFor={'scope'}>Fokus dan ruang lingkup</label>
          <textarea id={'scope'} name={'scope'} required minLength={20} />
          <label htmlFor={'contactEmail'}>Email kontak</label>
          <input id={'contactEmail'} name={'contactEmail'} type={'email'} required />
          <label htmlFor={'primaryLanguage'}>Bahasa utama</label>
          <input id={'primaryLanguage'} name={'primaryLanguage'} defaultValue={'id'} required />
          <label htmlFor={'reviewModel'}>Model review</label>
          <select id={'reviewModel'} name={'reviewModel'} defaultValue={'DOUBLE_ANONYMOUS'}>
            <option value={'DOUBLE_ANONYMOUS'}>Double-anonymous</option>
            <option value={'SINGLE_ANONYMOUS'}>Single-anonymous</option>
          </select>
          <label htmlFor={'status'}>Status publikasi</label>
          <select id={'status'} name={'status'} defaultValue={'DRAFT'}>
            <option value={'DRAFT'}>Draft</option>
            <option value={'PUBLISHED'}>Published</option>
          </select>
          <label className={'checkbox-row'}>
            <input name={'submissionsOpen'} type={'checkbox'} value={'true'} /> Buka pengajuan
            naskah
          </label>
          <button type={'submit'}>Simpan jurnal</button>
        </form>
      </section>
      <section className={'admin-next'} aria-labelledby={'managed-journals-heading'}>
        <h2 id={'managed-journals-heading'}>Jurnal yang dikelola</h2>
        {journals.length ? (
          <div className={'session-list'}>
            {journals.map((journal) => (
              <article key={journal.id}>
                <div>
                  <strong>{journal.title}</strong>
                  <span>
                    {journal.abbreviation} · {journal.status} · {journal._count.memberships} anggota
                  </span>
                  <small>{journal.reviewModel}</small>
                </div>
                <div className={'journal-admin-actions'}>
                  <a className={'secondary-action'} href={`/admin/journals/${journal.id}`}>
                    Sunting konfigurasi
                  </a>
                  <form
                    action={'/auth/add-journal-member'}
                    method={'post'}
                    className={'inline-membership-form'}
                  >
                    <input type={'hidden'} name={'journalId'} value={journal.id} />
                    <input
                      name={'email'}
                      type={'email'}
                      aria-label={'Email pengguna'}
                      placeholder={'email pengguna'}
                      required
                    />
                    <select name={'role'} aria-label={'Role jurnal'} defaultValue={'AUTHOR'}>
                      <option value={'AUTHOR'}>Author</option>
                      <option value={'REVIEWER'}>Reviewer</option>
                      <option value={'COPYEDITOR'}>Copyeditor</option>
                      <option value={'PRODUCTION_EDITOR'}>Production editor</option>
                      <option value={'SECTION_EDITOR'}>Section editor</option>
                      <option value={'EDITOR_IN_CHIEF'}>Editor-in-chief</option>
                      <option value={'JOURNAL_MANAGER'}>Journal manager</option>
                    </select>
                    <button className={'secondary-button'} type={'submit'}>
                      Tambahkan
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>Belum ada jurnal.</p>
        )}
      </section>
    </main>
  );
}
