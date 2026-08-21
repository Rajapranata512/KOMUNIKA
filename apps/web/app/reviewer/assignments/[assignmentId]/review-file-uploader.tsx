'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ReviewFile {
  id: string;
  authorVisible: boolean;
  storedFile: { id: string; originalName: string; size: number; scanStatus: string };
}

export function ReviewFileUploader({
  assignmentId,
  files,
  locked,
}: {
  assignmentId: string;
  files: ReviewFile[];
  locked: boolean;
}) {
  const router = useRouter();
  const [authorVisible, setAuthorVisible] = useState(false);
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (
      !files.some(({ storedFile }) =>
        ['AWAITING_UPLOAD', 'QUARANTINED'].includes(storedFile.scanStatus),
      )
    )
      return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [files, router]);

  async function upload(file: File) {
    setState('uploading');
    setProgress(0);
    const authorization = await fetch('/auth/review-file-authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assignmentId,
        file: { originalName: file.name, declaredMime: file.type, size: file.size, authorVisible },
      }),
    });
    if (!authorization.ok) {
      setState('error');
      return;
    }
    const body = (await authorization.json()) as {
      fileId: string;
      uploadUrl: string;
      requiredHeaders: { 'content-type': string };
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const upload = new XMLHttpRequest();
        upload.open('PUT', body.uploadUrl);
        upload.setRequestHeader('content-type', body.requiredHeaders['content-type']);
        upload.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        upload.onload = () =>
          upload.status >= 200 && upload.status < 300
            ? resolve()
            : reject(new Error('upload failed'));
        upload.onerror = () => reject(new Error('upload failed'));
        upload.send(file);
      });
      const completion = await fetch('/auth/review-file-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignmentId, fileId: body.fileId }),
      });
      if (!completion.ok) throw new Error('completion failed');
      setState('idle');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  async function remove(fileId: string) {
    if (!window.confirm('Hapus file review privat ini?')) return;
    const response = await fetch('/auth/review-file-remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignmentId, fileId }),
    });
    if (response.ok) router.refresh();
    else setState('error');
  }

  return (
    <section className={'review-files'} aria-labelledby={'review-files-heading'}>
      <h3 id={'review-files-heading'}>File pendukung review</h3>
      <p>
        PDF, DOCX, atau teks hingga 25 MB. Semua file tetap privat dan dipindai sebelum dapat
        digunakan.
      </p>
      <ul className={'file-list'}>
        {files.map((file) => (
          <li key={file.id}>
            <div>
              <strong>{file.storedFile.originalName}</strong>
              <small>
                {file.storedFile.scanStatus} ·{' '}
                {file.authorVisible ? 'Dapat dipilih editor untuk author' : 'Rahasia editor'}
              </small>
            </div>
            {!locked ? (
              <button
                type={'button'}
                className={'secondary-button'}
                onClick={() => void remove(file.storedFile.id)}
              >
                Hapus
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!locked ? (
        <>
          <label className={'check-row'}>
            <input
              type={'checkbox'}
              checked={authorVisible}
              onChange={(event) => setAuthorVisible(event.target.checked)}
            />
            <span>Tandai dapat dirilis kepada author oleh editor</span>
          </label>
          <label>
            Pilih file
            <input
              type={'file'}
              accept={'.pdf,.docx,.txt'}
              disabled={state === 'uploading'}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
        </>
      ) : null}
      {state === 'uploading' ? (
        <p role={'status'}>Upload {progress}%</p>
      ) : state === 'error' ? (
        <p className={'form-error'} role={'alert'}>
          File review tidak dapat diproses.
        </p>
      ) : null}
    </section>
  );
}
