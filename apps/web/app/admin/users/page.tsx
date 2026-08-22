import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { DeleteUserForm } from './delete-user-form';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  platformRole: 'PLATFORM_ADMIN' | null;
  emailVerifiedAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  canDelete: boolean;
  _count: { journalMemberships: number; sessions: number };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cursor?: string;
    updated?: string;
    deleted?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.cursor) query.set('cursor', params.cursor);
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/admin/users?${query}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('User administration could not be loaded.');
  const data = (await response.json()) as { users: AdminUser[]; nextCursor: string | null };

  return (
    <main id={'main-content'} className={'admin-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>Administrasi platform</p>
          <h1>Pengguna</h1>
          <p>Kelola akses akun tanpa mengubah riwayat aktivitasnya.</p>
        </div>
        <a className={'secondary-action'} href={'/admin'}>
          Kembali
        </a>
      </header>
      {params.updated ? (
        <div className={'form-success'} role={'status'}>
          Status pengguna berhasil diperbarui.
        </div>
      ) : null}
      {params.deleted ? (
        <div className={'form-success'} role={'status'}>
          Akun pengguna berhasil dihapus. Rekam audit administrator tetap disimpan.
        </div>
      ) : null}
      {params.error ? (
        <div className={'form-error'} role={'alert'}>
          {params.error === 'delete-blocked'
            ? 'Akun memiliki rekam jurnal atau editorial. Nonaktifkan akun untuk mempertahankan riwayat akademik.'
            : params.error === 'delete'
              ? 'Akun tidak dapat dihapus. Akun administrator dilindungi dari penghapusan.'
              : 'Status tidak dapat diperbarui. Akun sendiri atau administrator aktif terakhir tidak dapat dinonaktifkan.'}
        </div>
      ) : null}
      <form action={'/admin/users'} method={'get'} className={'search-form'}>
        <label htmlFor={'user-query'}>Cari nama atau email</label>
        <div>
          <input id={'user-query'} name={'q'} defaultValue={params.q} />
          <button type={'submit'}>Cari pengguna</button>
        </div>
      </form>
      <section className={'admin-next'} aria-labelledby={'users-heading'}>
        <div className={'section-heading'}>
          <h2 id={'users-heading'}>Daftar pengguna</h2>
          <p>{data.users.length} pengguna</p>
        </div>
        {data.users.length ? (
          <div className={'session-list'}>
            {data.users.map((user) => (
              <article key={user.id}>
                <div>
                  <strong>{user.fullName || user.email}</strong>
                  <span>
                    {user.email} ·{' '}
                    {user.platformRole === 'PLATFORM_ADMIN' ? 'Platform admin' : 'Pengguna'} ·{' '}
                    {user.disabledAt ? 'Dinonaktifkan' : 'Aktif'}
                  </span>
                  <small>
                    {user.emailVerifiedAt ? 'Email terverifikasi' : 'Email belum terverifikasi'} ·{' '}
                    {user._count.journalMemberships} keanggotaan jurnal · {user._count.sessions}{' '}
                    sesi
                  </small>
                </div>
                <div className={'user-admin-actions'}>
                  <form action={'/auth/admin-user-status'} method={'post'}>
                    <input type={'hidden'} name={'userId'} value={user.id} />
                    <input
                      type={'hidden'}
                      name={'disabled'}
                      value={user.disabledAt ? 'false' : 'true'}
                    />
                    <button className={'secondary-button'} type={'submit'}>
                      {user.disabledAt ? 'Aktifkan kembali' : 'Nonaktifkan akun'}
                    </button>
                  </form>
                  {user.canDelete ? <DeleteUserForm userId={user.id} email={user.email} /> : null}
                  {!user.canDelete && user.platformRole === null ? (
                    <small>Riwayat jurnal terhubung; akun hanya dapat dinonaktifkan.</small>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={'empty-state'}>
            <h3>Pengguna tidak ditemukan</h3>
            <p>Ubah kata pencarian atau tunggu pengguna mendaftar.</p>
          </div>
        )}
        {data.nextCursor ? (
          <p>
            <a
              className={'secondary-action'}
              href={`/admin/users?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), cursor: data.nextCursor })}`}
            >
              Halaman berikutnya
            </a>
          </p>
        ) : null}
      </section>
    </main>
  );
}
