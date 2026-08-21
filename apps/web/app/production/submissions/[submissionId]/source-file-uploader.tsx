'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const acceptedTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'text/plain',
].join(',');

export function SourceFileUploader({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setState('Meminta izin upload...');
    try {
      const authorization = await fetch('/auth/source-file-authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          file: { originalName: file.name, declaredMime: file.type, size: file.size },
        }),
      });
      if (!authorization.ok) throw new Error('Izin upload ditolak.');
      const target = (await authorization.json()) as {
        fileId: string;
        uploadUrl: string;
        requiredHeaders: Record<string, string>;
      };
      setState('Mengunggah source file privat...');
      const put = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: target.requiredHeaders,
        body: file,
      });
      if (!put.ok) throw new Error('Upload gagal.');
      const complete = await fetch('/auth/source-file-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submissionId, fileId: target.fileId }),
      });
      if (!complete.ok) throw new Error('Finalisasi upload gagal.');
      setState('File dikarantina dan sedang dipindai. Muat ulang setelah scan selesai.');
      router.refresh();
    } catch (error) {
      setState(error instanceof Error ? error.message : 'Upload gagal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'editorial-action-form'}>
      <label>
        Upload source copyediting privat
        <input
          type={'file'}
          accept={acceptedTypes}
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      <small>PDF, DOCX, ODT, atau TXT; maksimum 25 MB. File tidak pernah dipublikasikan.</small>
      {state ? <p role={'status'}>{state}</p> : null}
    </div>
  );
}
