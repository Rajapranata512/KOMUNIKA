'use client';

import { useMemo, useState } from 'react';

type DecisionType = 'REJECT' | 'MAJOR_REVISION' | 'MINOR_REVISION' | 'ACCEPT';

interface DecisionContext {
  journal: { title: string };
  version: { id: string; version: number } | null;
  templates: Array<{ id: string; kind: string; title: string; body: string }>;
  round: {
    id: string;
    sequence: number;
    assignments: Array<{
      reviewer: { id: string; email: string; fullName: string | null };
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

const kindByType: Record<DecisionType, string> = {
  REJECT: 'DECISION_REJECT',
  MAJOR_REVISION: 'DECISION_MAJOR_REVISION',
  MINOR_REVISION: 'DECISION_MINOR_REVISION',
  ACCEPT: 'DECISION_ACCEPT',
};

function fallbackBody(type: DecisionType) {
  if (type === 'ACCEPT')
    return 'Yth. Penulis,\n\nNaskah Anda diterima untuk dilanjutkan ke tahap produksi.';
  if (type === 'REJECT')
    return 'Yth. Penulis,\n\nSetelah evaluasi editorial, naskah belum dapat kami terima.';
  return 'Yth. Penulis,\n\nMohon kirimkan naskah revisi dan tanggapan terstruktur terhadap komentar yang dirilis.';
}

export function DecisionForm({
  submissionId,
  context,
}: {
  submissionId: string;
  context: DecisionContext;
}) {
  const initialType: DecisionType = context.round ? 'MAJOR_REVISION' : 'ACCEPT';
  const [type, setType] = useState<DecisionType>(initialType);
  const [subject, setSubject] = useState('Keputusan editorial — ' + context.journal.title);
  const initialTemplate = context.templates.find(({ kind }) => kind === kindByType[initialType]);
  const [body, setBody] = useState(initialTemplate?.body ?? fallbackBody(initialType));
  const isRevision = type === 'MAJOR_REVISION' || type === 'MINOR_REVISION';
  const responses = useMemo(
    () => context.round?.assignments.flatMap(({ response }) => (response ? [response] : [])) ?? [],
    [context.round],
  );

  function changeType(next: DecisionType) {
    setType(next);
    const template = context.templates.find(({ kind }) => kind === kindByType[next]);
    setSubject(template?.title ?? 'Keputusan editorial — ' + context.journal.title);
    setBody(template?.body ?? fallbackBody(next));
  }

  return (
    <form action={'/auth/decision-action'} method={'post'} className={'editorial-action-form'}>
      <input type={'hidden'} name={'submissionId'} value={submissionId} />
      <h3>Keputusan editorial final</h3>
      <p>
        Target versi {context.version?.version ?? '—'}
        {context.round ? ' · round ' + context.round.sequence : ' · evaluasi editor'}
      </p>
      <label>
        Keputusan
        <select
          name={'type'}
          value={type}
          onChange={(event) => changeType(event.target.value as DecisionType)}
          required
        >
          <option value={'MAJOR_REVISION'}>Revisi mayor</option>
          <option value={'MINOR_REVISION'}>Revisi minor</option>
          <option value={'ACCEPT'}>Accept</option>
          <option value={'REJECT'}>Reject</option>
        </select>
      </label>
      <label>
        Alasan internal editorial
        <textarea name={'reason'} rows={4} minLength={20} required />
      </label>
      <label>
        Subjek surat
        <input
          name={'subject'}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          minLength={5}
          required
        />
      </label>
      <label>
        Surat keputusan (dapat diedit sebelum dirilis)
        <textarea
          name={'body'}
          rows={9}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={40}
          required
        />
      </label>
      {isRevision ? (
        <>
          <label>
            Tenggat revisi
            <input
              name={'revisionDueAt'}
              type={'datetime-local'}
              required
              defaultValue={new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 16)}
            />
          </label>
          <label>
            Jalur evaluasi berikutnya
            <select name={'evaluationMode'} defaultValue={'EXTERNAL_REVIEW'} required>
              <option value={'EXTERNAL_REVIEW'}>Round review eksternal baru</option>
              <option value={'EDITOR_ONLY'}>Evaluasi editor saja</option>
            </select>
          </label>
          <label className={'check-row'}>
            <input type={'checkbox'} name={'responseRequired'} defaultChecked />
            <span>Wajibkan tanggapan terstruktur dan response file</span>
          </label>
        </>
      ) : null}
      {responses.length ? (
        <fieldset>
          <legend>Konten review yang dirilis kepada author</legend>
          {responses.map((response, index) => (
            <div key={response.id} className={'decision-release-option'}>
              <label className={'check-row'}>
                <input type={'checkbox'} name={'releaseResponseIds'} value={response.id} />
                <span>
                  Komentar reviewer {index + 1}: {response.commentsToAuthor}
                </span>
              </label>
              {response.files.map((file) => (
                <label className={'check-row'} key={file.id}>
                  <input type={'checkbox'} name={'releaseReviewFileIds'} value={file.id} />
                  <span>File: {file.storedFile.originalName}</span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      ) : (
        <p>Belum ada komentar review final yang dapat dipilih untuk dirilis.</p>
      )}
      <button type={'submit'}>Rilis keputusan dan kunci round</button>
    </form>
  );
}
