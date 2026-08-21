import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
interface Item {
  id: string;
  title: string;
  state: string;
  updatedAt: string;
  journal: { title: string };
  publication: { status: string; scheduledAt: string | null } | null;
}
export default async function ProductionPage() {
  const jar = await cookies();
  const response = await fetch(apiBaseUrl + '/production/worklist', {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Production worklist could not be loaded.');
  const items = (await response.json()) as Item[];
  return (
    <main id={'main-content'} className={'admin-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>Produksi publikasi</p>
          <h1>Copyediting dan produksi</h1>
          <p>
            Kelola naskah diterima hingga terbit dengan rekam metadata dan galley yang tervalidasi.
          </p>
        </div>
        <Link className={'secondary-button'} href={'/workspace'}>
          Kembali ke workspace
        </Link>
      </header>
      <section className={'admin-next'}>
        <h2>Worklist</h2>
        {items.length ? (
          <div className={'table-wrap'}>
            <table>
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Jurnal</th>
                  <th>Stage</th>
                  <th>Publikasi</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.journal.title}</td>
                    <td>{item.state}</td>
                    <td>{item.publication?.status ?? 'Belum disiapkan'}</td>
                    <td>
                      <Link href={'/production/submissions/' + item.id}>Buka</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={'empty-state'}>
            <h3>Belum ada pekerjaan produksi</h3>
            <p>Submission yang diterima atau ditugaskan akan muncul di sini.</p>
          </div>
        )}
      </section>
    </main>
  );
}
