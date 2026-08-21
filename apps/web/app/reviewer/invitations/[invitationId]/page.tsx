import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface Invitation {
  id: string;
  journal: { title: string; reviewModel: string };
  manuscript: {
    title: string;
    abstract: string;
    keywords: string[];
    authors?: Array<{ givenName: string; familyName: string; affiliation: string }>;
  };
  responseDeadline: string;
  reviewDeadline: string;
  confidentiality: string;
}

export default async function ReviewInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ invitationId: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { invitationId } = await params;
  const query = await searchParams;
  if (!query.token) notFound();
  const cookieStore = await cookies();
  const response = await fetch(
    `${apiBaseUrl}/reviews/invitations/${invitationId}?token=${encodeURIComponent(query.token)}`,
    { headers: { cookie: cookieStore.toString() }, cache: 'no-store' },
  );
  if (response.status === 401) redirect('/login');
  if (response.status === 404 || response.status === 409) notFound();
  if (!response.ok) throw new Error('Review invitation could not be loaded.');
  const invitation = (await response.json()) as Invitation;
  return (
    <main id={'main-content'} className={'auth-shell reviewer-invitation'}>
      <section className={'auth-panel'}>
        <p className={'eyebrow'}>{invitation.journal.title}</p>
        <h1>Undangan peer review</h1>
        {query.error ? (
          <p className={'form-error'} role={'alert'}>
            Respons tidak dapat diproses. Periksa deklarasi konflik dan masa berlaku undangan.
          </p>
        ) : null}
        <dl className={'editorial-metadata'}>
          <div>
            <dt>Naskah</dt>
            <dd>{invitation.manuscript.title}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{invitation.journal.reviewModel}</dd>
          </div>
          <div>
            <dt>Batas respons</dt>
            <dd>{new Date(invitation.responseDeadline).toLocaleString('id-ID')}</dd>
          </div>
          <div>
            <dt>Batas review</dt>
            <dd>{new Date(invitation.reviewDeadline).toLocaleString('id-ID')}</dd>
          </div>
        </dl>
        <h2>Abstrak</h2>
        <p className={'long-form-copy'}>{invitation.manuscript.abstract}</p>
        <p>{invitation.manuscript.keywords.join(' · ')}</p>
        {invitation.manuscript.authors ? (
          <>
            <h2>Penulis</h2>
            <ul>
              {invitation.manuscript.authors.map((author) => (
                <li key={`${author.givenName}-${author.familyName}`}>
                  {author.givenName} {author.familyName} · {author.affiliation}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className={'confidential-note'}>{invitation.confidentiality}</p>
        <form action={'/auth/review-action'} method={'post'} className={'auth-form'}>
          <input type={'hidden'} name={'action'} value={'invitation-response'} />
          <input type={'hidden'} name={'invitationId'} value={invitation.id} />
          <input type={'hidden'} name={'token'} value={query.token} />
          <label className={'check-row'}>
            <input type={'checkbox'} name={'conflictDeclared'} />
            <span>Saya memiliki konflik kepentingan dan harus menolak undangan ini.</span>
          </label>
          <label htmlFor={'conflict-note'}>Catatan konflik atau alasan penolakan (opsional)</label>
          <textarea id={'conflict-note'} name={'conflictNote'} rows={4} />
          <div className={'workspace-actions'}>
            <button type={'submit'} name={'response'} value={'ACCEPT'}>
              Terima undangan
            </button>
            <button
              type={'submit'}
              name={'response'}
              value={'DECLINE'}
              className={'secondary-button'}
            >
              Tolak undangan
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
