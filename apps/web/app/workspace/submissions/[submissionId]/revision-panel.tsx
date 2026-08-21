'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface RevisionFile {
  purpose: 'MANUSCRIPT' | 'SUPPLEMENTARY' | 'RESPONSE';
  storedFile: {
    id: string;
    originalName: string;
    size: number;
    detectedMime: string | null;
    scanStatus: string;
  };
}

export function RevisionPanel({
  submissionId,
  revision,
}: {
  submissionId: string;
  revision: {
    id: string;
    responseRequired: boolean;
    responseText: string;
    dueAt: string;
    submittedAt: string | null;
    baseVersion: { version: number };
    submittedVersion: { version: number } | null;
    files: RevisionFile[];
  };
}) {
  const router = useRouter();
  const [responseText, setResponseText] = useState(revision.responseText);
  const [dirty, setDirty] = useState(false);
  const [purpose, setPurpose] = useState<'MANUSCRIPT' | 'SUPPLEMENTARY' | 'RESPONSE'>('MANUSCRIPT');
  const [state, setState] = useState<'idle' | 'saving' | 'uploading' | 'submitting' | 'error'>(
    'idle',
  );
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (
      !revision.files.some(({ storedFile }) =>
        ['AWAITING_UPLOAD', 'QUARANTINED'].includes(storedFile.scanStatus),
      )
    )
      return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [revision.files, router]);

  async function save() {
    setState('saving');
    const result = await fetch('/auth/revision-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save', revisionId: revision.id, responseText }),
    });
    setState(result.ok ? 'idle' : 'error');
    if (result.ok) setDirty(false);
  }

  async function upload(file: File) {
    setState('uploading');
    setProgress(0);
    const authorization = await fetch('/auth/submission-file-authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        submissionId,
        file: { originalName: file.name, declaredMime: file.type, size: file.size, purpose },
      }),
    });
    if (!authorization.ok) {
      setState('error');
      return;
    }
    const data = (await authorization.json()) as {
      fileId: string;
      uploadUrl: string;
      requiredHeaders: { 'content-type': string };
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', data.uploadUrl);
        request.setRequestHeader('content-type', data.requiredHeaders['content-type']);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () =>
          request.status >= 200 && request.status < 300
            ? resolve()
            : reject(new Error('upload failed'));
        request.onerror = () => reject(new Error('upload failed'));
        request.send(file);
      });
      const completion = await fetch('/auth/submission-file-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submissionId, fileId: data.fileId }),
      });
      if (!completion.ok) throw new Error('completion failed');
      setState('idle');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  async function remove(fileId: string) {
    if (!window.confirm('Hapus file revisi privat ini?')) return;
    const result = await fetch('/auth/submission-file-remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submissionId, fileId }),
    });
    if (result.ok) router.refresh();
    else setState('error');
  }

  async function finalize() {
    setState('submitting');
    setErrors([]);
    if (dirty) {
      const saved = await fetch('/auth/revision-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', revisionId: revision.id, responseText }),
      });
      if (!saved.ok) {
        setState('error');
        return;
      }
    }
    const result = await fetch('/auth/revision-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'finalize',
        revisionId: revision.id,
        idempotencyKey: crypto.randomUUID() + crypto.randomUUID(),
      }),
    });
    if (!result.ok) {
      const body = (await result.json().catch(() => null)) as { fields?: string[] } | null;
      setErrors(body?.fields ?? ['REVISION_NOT_READY']);
      setState('error');
      return;
    }
    setDirty(false);
    router.refresh();
  }

  if (revision.submittedAt)
    return (
      <section className={'admin-next'}>
        <h2>Revisi telah dikirim</h2>
        <p>
          Versi {revision.submittedVersion?.version ?? 'baru'} dikirim pada{' '}
          {new Date(revision.submittedAt).toLocaleString('id-ID')}.
        </p>
      </section>
    );

  return (
    <section className={'admin-next auth-form'} aria-labelledby={'revision-heading'}>
      <h2 id={'revision-heading'}>Kirim revisi</h2>
      <p>
        Berdasarkan versi {revision.baseVersion.version} · tenggat{' '}
        {new Date(revision.dueAt).toLocaleString('id-ID')}
      </p>
      <label>
        Tanggapan terstruktur kepada reviewer {revision.responseRequired ? '*' : ''}
        <textarea
          rows={10}
          value={responseText}
          onChange={(event) => {
            setResponseText(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      <button type={'button'} className={'secondary-button'} onClick={() => void save()}>
        Simpan tanggapan
      </button>
      <h3>File revisi privat</h3>
      <ul className={'file-list'}>
        {revision.files.map(({ purpose: filePurpose, storedFile }) => (
          <li key={storedFile.id}>
            <div>
              <strong>{storedFile.originalName}</strong>
              <small>
                {filePurpose} · {storedFile.scanStatus}
              </small>
            </div>
            <button
              type={'button'}
              className={'secondary-button'}
              onClick={() => void remove(storedFile.id)}
            >
              Hapus
            </button>
          </li>
        ))}
      </ul>
      <label>
        Jenis file
        <select
          value={purpose}
          onChange={(event) => setPurpose(event.target.value as typeof purpose)}
        >
          <option value={'MANUSCRIPT'}>Naskah revisi</option>
          <option value={'RESPONSE'}>Response to reviewers</option>
          <option value={'SUPPLEMENTARY'}>Lampiran revisi</option>
        </select>
      </label>
      <label>
        Pilih file
        <input
          type={'file'}
          disabled={state === 'uploading'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      {state === 'uploading' ? <p role={'status'}>Upload {progress}%</p> : null}
      {errors.length ? (
        <div className={'form-error'} role={'alert'}>
          <p>Revisi belum dapat dikirim:</p>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type={'button'} disabled={state === 'submitting'} onClick={() => void finalize()}>
        {state === 'submitting' ? 'Mengirim…' : 'Kirim versi revisi'}
      </button>
    </section>
  );
}
