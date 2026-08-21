import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { DecisionForm } from './decision-form';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface Person {
  id: string;
  email: string;
  fullName: string | null;
}
interface EditorialDetail {
  submission: {
    id: string;
    state: string;
    title: string;
    abstract: string;
    coverLetter: string;
    submittedAt: string | null;
    journal: { id: string; title: string; reviewModel: string };
    articleType: { title: string; peerReviewRequired: boolean };
    authors: Array<
      Person & {
        givenName: string;
        familyName: string;
        affiliation: string;
        isCorresponding: boolean;
      }
    >;
    files: Array<{
      id: string;
      purpose: string;
      storedFile: {
        originalName: string;
        detectedMime: string | null;
        declaredMime: string;
        size: number;
        scanStatus: string;
      };
    }>;
    checklistAcceptances: Array<{ id: string; labelSnapshot: string; accepted: boolean }>;
    declarations: Array<{ id: string; declarationTitle: string; accepted: boolean }>;
    editorialAssignments: Array<{
      id: string;
      active: boolean;
      assignedAt: string;
      assignmentNote: string;
      overrideReason: string | null;
      editor: Person;
      assignedBy: Person;
    }>;
    screeningAssessments: Array<{
      id: string;
      completenessPassed: boolean;
      scopePassed: boolean;
      policyPassed: boolean;
      internalNote: string;
      createdAt: string;
      actor: Person;
    }>;
    screeningDecisions: Array<{
      id: string;
      type: string;
      reason: string;
      authorLetter: string;
      requiredChanges: string[];
      resultingState: string;
      createdAt: string;
      actor: Person;
    }>;
    editorialNotes: Array<{ id: string; body: string; createdAt: string; actor: Person }>;
  };
  permissions: { canAssign: boolean };
  editorCandidates: Array<{ role: string; user: Person }>;
}

interface ReviewerCandidate {
  id: string;
  email: string;
  fullName: string | null;
  affiliation: string | null;
  expertise: string[];
  languages: string[];
  availability: string;
  activeAssignments: number;
  capacity: number;
  canAccept: boolean;
}

interface ReviewFormSummary {
  id: string;
  name: string;
  version: number;
  questions: Array<{ id: string; prompt: string }>;
}

interface ReviewRoundSummary {
  id: string;
  sequence: number;
  openedAt: string;
  reviewForm: { id: string; name: string; version: number };
  invitations: Array<{
    id: string;
    status: string;
    responseDeadline: string;
    reviewDeadline: string;
    reminderCount: number;
    reviewer: Person;
    assignment: {
      id: string;
      response: { status: string; recommendation: string | null } | null;
    } | null;
  }>;
}

interface DecisionContext {
  state: string;
  journal: { title: string };
  version: { id: string; version: number } | null;
  templates: Array<{ id: string; kind: string; title: string; body: string }>;
  revision: {
    id: string;
    dueAt: string;
    submittedAt: string | null;
    responseRequired: boolean;
    responseText: string;
    reminderCount: number;
    lastReminderAt: string | null;
    decision: { evaluationMode: string | null };
    submittedVersion: { id: string; version: number } | null;
  } | null;
  round: {
    id: string;
    sequence: number;
    assignments: Array<{
      reviewer: Person;
      response: {
        id: string;
        commentsToAuthor: string;
        confidentialComments: string;
        recommendation: string | null;
        files: Array<{
          id: string;
          storedFile: {
            id: string;
            originalName: string;
            size: number;
            detectedMime: string | null;
          };
        }>;
      } | null;
    }>;
  } | null;
}

const personName = (person: Person) => person.fullName ?? person.email;

export default async function EditorialSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { submissionId } = await params;
  const { result } = await searchParams;
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/editorial/submissions/${submissionId}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 403 || response.status === 404) notFound();
  if (!response.ok) throw new Error('Editorial submission could not be loaded.');
  const detail = (await response.json()) as EditorialDetail;
  const submission = detail.submission;
  const reviewHeaders = { cookie: cookieStore.toString() };
  const [directoryResponse, formsResponse, roundsResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/reviews/directory?submissionId=${submissionId}`, {
      headers: reviewHeaders,
      cache: 'no-store',
    }),
    fetch(`${apiBaseUrl}/reviews/forms?submissionId=${submissionId}`, {
      headers: reviewHeaders,
      cache: 'no-store',
    }),
    fetch(`${apiBaseUrl}/reviews/editor/submissions/${submissionId}/rounds`, {
      headers: reviewHeaders,
      cache: 'no-store',
    }),
  ]);
  const reviewers = directoryResponse.ok
    ? ((await directoryResponse.json()) as ReviewerCandidate[])
    : [];
  const reviewForms = formsResponse.ok ? ((await formsResponse.json()) as ReviewFormSummary[]) : [];
  const reviewRounds = roundsResponse.ok
    ? ((await roundsResponse.json()) as ReviewRoundSummary[])
    : [];
  const decisionResponse = await fetch(
    apiBaseUrl + '/decisions/editor/submissions/' + submissionId + '/context',
    { headers: reviewHeaders, cache: 'no-store' },
  );
  const decisionContext = decisionResponse.ok
    ? ((await decisionResponse.json()) as DecisionContext)
    : null;
  const assignment = submission.editorialAssignments.find(({ active }) => active);
  const assessment = submission.screeningAssessments[0];
  const canScreen = ['SUBMITTED', 'INITIAL_SCREENING'].includes(submission.state);
  const canDecide = submission.state === 'INITIAL_SCREENING';

  return (
    <main id={'main-content'} className={'editorial-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>{submission.journal.title}</p>
          <h1>{submission.title}</h1>
          <p>
            {submission.articleType.title} · {submission.state} · ID {submission.id}
          </p>
        </div>
        <Link className={'secondary-button'} href={`/editorial?journalId=${submission.journal.id}`}>
          Kembali ke queue
        </Link>
      </header>
      {result === 'error' ? (
        <div className={'form-error'} role={'alert'}>
          Tindakan ditolak. Periksa state, authorization, dan isian wajib.
        </div>
      ) : result ? (
        <div className={'form-success'} role={'status'}>
          Tindakan editorial berhasil dicatat dan diaudit.
        </div>
      ) : null}
      <div className={'editorial-workspace'}>
        <section className={'editorial-manuscript'} aria-labelledby={'manuscript-heading'}>
          <h2 id={'manuscript-heading'}>Naskah dan metadata</h2>
          <dl className={'editorial-metadata'}>
            <div>
              <dt>Model review</dt>
              <dd>{submission.journal.reviewModel}</dd>
            </div>
            <div>
              <dt>Review eksternal</dt>
              <dd>
                {submission.articleType.peerReviewRequired ? 'Diperlukan' : 'Tidak diperlukan'}
              </dd>
            </div>
            <div>
              <dt>Dikirim</dt>
              <dd>
                {submission.submittedAt
                  ? new Date(submission.submittedAt).toLocaleString('id-ID')
                  : 'Belum tercatat'}
              </dd>
            </div>
          </dl>
          <h3>Abstrak</h3>
          <p className={'long-form-copy'}>{submission.abstract}</p>
          {submission.coverLetter ? (
            <>
              <h3>Surat pengantar</h3>
              <p className={'long-form-copy'}>{submission.coverLetter}</p>
            </>
          ) : null}
          <h3>Penulis</h3>
          <ol className={'editorial-record-list'}>
            {submission.authors.map((author) => (
              <li key={author.id}>
                <strong>
                  {author.givenName} {author.familyName}
                  {author.isCorresponding ? ' — korespondensi' : ''}
                </strong>
                <span>{author.affiliation}</span>
                <span>{author.email}</span>
              </li>
            ))}
          </ol>
          <h3>File privat</h3>
          <ul className={'editorial-record-list'}>
            {submission.files.map((file) => (
              <li key={file.id}>
                <strong>{file.storedFile.originalName}</strong>
                <span>
                  {file.purpose} · {file.storedFile.detectedMime ?? file.storedFile.declaredMime} ·{' '}
                  {(file.storedFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <span className={`status-badge status-${file.storedFile.scanStatus.toLowerCase()}`}>
                  {file.storedFile.scanStatus}
                </span>
              </li>
            ))}
          </ul>
          <h3>Persyaratan dan deklarasi</h3>
          <ul className={'policy-list'}>
            {submission.checklistAcceptances.map((item) => (
              <li key={item.id}>
                {item.accepted ? '✓' : 'Belum diterima:'} {item.labelSnapshot}
              </li>
            ))}
            {submission.declarations.map((item) => (
              <li key={item.id}>
                {item.accepted ? '✓' : 'Belum diterima:'} {item.declarationTitle}
              </li>
            ))}
          </ul>
        </section>

        <section className={'editorial-stage'} aria-labelledby={'stage-heading'}>
          <h2 id={'stage-heading'}>Screening saat ini</h2>
          {canScreen ? (
            <form
              action={'/auth/editorial-action'}
              method={'post'}
              className={'editorial-action-form'}
            >
              <input type={'hidden'} name={'action'} value={'assess'} />
              <input type={'hidden'} name={'submissionId'} value={submission.id} />
              <label className={'check-row'}>
                <input
                  type={'checkbox'}
                  name={'completenessPassed'}
                  defaultChecked={assessment?.completenessPassed}
                />
                <span>Metadata, deklarasi, dan file lengkap</span>
              </label>
              <label className={'check-row'}>
                <input
                  type={'checkbox'}
                  name={'scopePassed'}
                  defaultChecked={assessment?.scopePassed}
                />
                <span>Topik sesuai scope jurnal</span>
              </label>
              <label className={'check-row'}>
                <input
                  type={'checkbox'}
                  name={'policyPassed'}
                  defaultChecked={assessment?.policyPassed}
                />
                <span>Kebijakan editorial terpenuhi</span>
              </label>
              <label>
                Catatan screening internal
                <textarea name={'internalNote'} rows={5} defaultValue={assessment?.internalNote} />
              </label>
              <button type={'submit'}>Simpan pemeriksaan</button>
            </form>
          ) : (
            <p>Screening awal telah ditutup untuk state ini.</p>
          )}
          <h3>Riwayat assessment</h3>
          <ol className={'editorial-history'}>
            {submission.screeningAssessments.map((item) => (
              <li key={item.id}>
                <strong>{personName(item.actor)}</strong>
                <span>
                  Kelengkapan {item.completenessPassed ? 'lulus' : 'perlu perbaikan'}; scope{' '}
                  {item.scopePassed ? 'lulus' : 'tidak sesuai'}; kebijakan{' '}
                  {item.policyPassed ? 'lulus' : 'perlu perbaikan'}.
                </span>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString('id-ID')}
                </time>
              </li>
            ))}
          </ol>
          <h3>Catatan internal</h3>
          <p className={'confidential-note'}>Bagian ini tidak pernah dikirim kepada author.</p>
          <form
            action={'/auth/editorial-action'}
            method={'post'}
            className={'editorial-action-form'}
          >
            <input type={'hidden'} name={'action'} value={'note'} />
            <input type={'hidden'} name={'submissionId'} value={submission.id} />
            <label>
              Catatan baru
              <textarea name={'body'} rows={4} required />
            </label>
            <button type={'submit'} className={'secondary-button'}>
              Tambah catatan internal
            </button>
          </form>
          <ol className={'editorial-history'}>
            {submission.editorialNotes.map((note) => (
              <li key={note.id}>
                <strong>{personName(note.actor)}</strong>
                <p>{note.body}</p>
                <time dateTime={note.createdAt}>
                  {new Date(note.createdAt).toLocaleString('id-ID')}
                </time>
              </li>
            ))}
          </ol>
          <h3>Round peer review</h3>
          {reviewRounds.length ? (
            <ol className={'editorial-history'}>
              {reviewRounds.map((round) => (
                <li key={round.id}>
                  <strong>
                    Round {round.sequence} · {round.reviewForm.name} v{round.reviewForm.version}
                  </strong>
                  {round.invitations.map((invitation) => (
                    <div key={invitation.id} className={'review-invitation-status'}>
                      <span>
                        {personName(invitation.reviewer)} · {invitation.status}
                      </span>
                      <span>
                        Tenggat review{' '}
                        {new Date(invitation.reviewDeadline).toLocaleDateString('id-ID')}
                      </span>
                      {invitation.assignment?.response ? (
                        <span>
                          Review {invitation.assignment.response.status}
                          {invitation.assignment.response.recommendation
                            ? ` · ${invitation.assignment.response.recommendation}`
                            : ''}
                        </span>
                      ) : null}
                      {['PENDING', 'ACCEPTED'].includes(invitation.status) ? (
                        <form action={'/auth/editorial-action'} method={'post'}>
                          <input type={'hidden'} name={'action'} value={'review-reminder'} />
                          <input type={'hidden'} name={'submissionId'} value={submission.id} />
                          <input type={'hidden'} name={'invitationId'} value={invitation.id} />
                          <button className={'secondary-button'} type={'submit'}>
                            Kirim pengingat
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          ) : (
            <p>Belum ada round peer review.</p>
          )}
        </section>

        <aside className={'editorial-actions'} aria-labelledby={'actions-heading'}>
          <h2 id={'actions-heading'}>Tindakan dan assignment</h2>
          <dl className={'editorial-metadata'}>
            <div>
              <dt>Handling editor</dt>
              <dd>{assignment ? personName(assignment.editor) : 'Belum ada'}</dd>
            </div>
          </dl>
          {detail.permissions.canAssign &&
          ['INITIAL_SCREENING', 'EDITOR_ASSIGNED'].includes(submission.state) ? (
            <form
              action={'/auth/editorial-action'}
              method={'post'}
              className={'editorial-action-form'}
            >
              <input type={'hidden'} name={'action'} value={'assign'} />
              <input type={'hidden'} name={'submissionId'} value={submission.id} />
              <label>
                Handling editor
                <select name={'editorId'} defaultValue={assignment?.editor.id ?? ''} required>
                  <option value={''}>Pilih editor</option>
                  {detail.editorCandidates.map((candidate) => (
                    <option
                      key={`${candidate.user.id}-${candidate.role}`}
                      value={candidate.user.id}
                    >
                      {personName(candidate.user)} — {candidate.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Catatan assignment
                <textarea name={'assignmentNote'} rows={3} />
              </label>
              {assignment ? (
                <label>
                  Alasan override (wajib bila mengganti editor)
                  <textarea name={'overrideReason'} rows={3} minLength={10} />
                </label>
              ) : null}
              <button type={'submit'}>Tetapkan editor</button>
            </form>
          ) : null}
          {submission.articleType.peerReviewRequired &&
          ['EDITOR_ASSIGNED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(submission.state) ? (
            <>
              <h3>Undang reviewer</h3>
              {!reviewForms.length ? (
                <p className={'form-error'}>
                  Buat form peer review aktif di konfigurasi jurnal sebelum mengirim undangan.
                </p>
              ) : null}
              {!reviewers.some(({ canAccept }) => canAccept) ? (
                <p>Belum ada reviewer aktif dengan kapasitas tersedia.</p>
              ) : null}
              {reviewForms.length && reviewers.some(({ canAccept }) => canAccept) ? (
                <form
                  action={'/auth/editorial-action'}
                  method={'post'}
                  className={'editorial-action-form'}
                >
                  <input type={'hidden'} name={'action'} value={'invite-reviewer'} />
                  <input type={'hidden'} name={'submissionId'} value={submission.id} />
                  <label>
                    Reviewer
                    <select name={'reviewerId'} required defaultValue={''}>
                      <option value={''}>Pilih reviewer</option>
                      {reviewers
                        .filter(({ canAccept }) => canAccept)
                        .map((reviewer) => (
                          <option key={reviewer.id} value={reviewer.id}>
                            {reviewer.fullName ?? reviewer.email} ·{' '}
                            {reviewer.affiliation ?? 'Tanpa afiliasi'} ·{' '}
                            {reviewer.activeAssignments}/{reviewer.capacity} aktif
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Form review
                    <select name={'reviewFormId'} required defaultValue={reviewForms[0]?.id}>
                      {reviewForms.map((form) => (
                        <option key={form.id} value={form.id}>
                          {form.name} · v{form.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Batas respons
                    <input
                      name={'responseDeadline'}
                      type={'datetime-local'}
                      required
                      defaultValue={new Date(Date.now() + 7 * 86_400_000)
                        .toISOString()
                        .slice(0, 16)}
                    />
                  </label>
                  <label>
                    Batas review
                    <input
                      name={'reviewDeadline'}
                      type={'datetime-local'}
                      required
                      defaultValue={new Date(Date.now() + 21 * 86_400_000)
                        .toISOString()
                        .slice(0, 16)}
                    />
                  </label>
                  <button type={'submit'}>Undang reviewer</button>
                </form>
              ) : null}
            </>
          ) : null}
          {canDecide ? (
            <form
              action={'/auth/editorial-action'}
              method={'post'}
              className={'editorial-action-form decision-form'}
            >
              <input type={'hidden'} name={'action'} value={'decide'} />
              <input type={'hidden'} name={'submissionId'} value={submission.id} />
              <label>
                Keputusan screening
                <select name={'decisionType'} required>
                  <option value={'REQUEST_CORRECTION'}>Minta koreksi pra-review</option>
                  <option value={'DESK_REJECT'}>Desk reject</option>
                </select>
              </label>
              <label>
                Alasan editorial
                <textarea name={'reason'} rows={4} minLength={10} required />
              </label>
              <label>
                Surat untuk author
                <textarea name={'authorLetter'} rows={7} minLength={20} required />
              </label>
              <label>
                Perubahan wajib (satu per baris; wajib untuk koreksi)
                <textarea name={'requiredChanges'} rows={5} />
              </label>
              <button type={'submit'}>Catat dan rilis keputusan</button>
            </form>
          ) : null}
          {decisionContext &&
          ['EDITOR_ASSIGNED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(submission.state) ? (
            <>
              {submission.state === 'RESUBMITTED' && decisionContext.revision?.submittedAt ? (
                <section className={'revision-evaluation'} aria-labelledby={'revision-heading'}>
                  <h3 id={'revision-heading'}>Respons revisi author</h3>
                  <dl className={'editorial-metadata'}>
                    <div>
                      <dt>Versi</dt>
                      <dd>
                        Versi {decisionContext.revision.submittedVersion?.version ?? 'terbaru'}
                      </dd>
                    </div>
                    <div>
                      <dt>Dikirim ulang</dt>
                      <dd>
                        {new Date(decisionContext.revision.submittedAt).toLocaleString('id-ID')}
                      </dd>
                    </div>
                    <div>
                      <dt>Rute evaluasi</dt>
                      <dd>{decisionContext.revision.decision.evaluationMode ?? 'EDITOR_ONLY'}</dd>
                    </div>
                  </dl>
                  <p className={'long-form-copy'}>{decisionContext.revision.responseText}</p>
                </section>
              ) : null}
              <DecisionForm submissionId={submission.id} context={decisionContext} />
            </>
          ) : null}
          {decisionContext?.revision &&
          submission.state === 'REVISION_REQUIRED' &&
          !decisionContext.revision.submittedAt ? (
            <form
              action={'/auth/revision-reminder'}
              method={'post'}
              className={'editorial-action-form'}
            >
              <input type={'hidden'} name={'submissionId'} value={submission.id} />
              <input type={'hidden'} name={'revisionId'} value={decisionContext.revision.id} />
              <h3>Menunggu revisi author</h3>
              <p>
                Tenggat {new Date(decisionContext.revision.dueAt).toLocaleString('id-ID')} ·{' '}
                {decisionContext.revision.reminderCount} pengingat
              </p>
              <button type={'submit'} className={'secondary-button'}>
                Kirim pengingat revisi
              </button>
            </form>
          ) : null}
          <h3>Riwayat keputusan</h3>
          <ol className={'editorial-history'}>
            {submission.screeningDecisions.map((decision) => (
              <li key={decision.id}>
                <strong>{decision.type}</strong>
                <span>{decision.reason}</span>
                <time dateTime={decision.createdAt}>
                  {new Date(decision.createdAt).toLocaleString('id-ID')}
                </time>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}
