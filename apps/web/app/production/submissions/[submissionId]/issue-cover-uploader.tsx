'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function IssueCoverUploader({ issueId }: { issueId: string }) {
  const router = useRouter();
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setState('Meminta izin upload...');
    try {
      const authorization = await fetch('/auth/issue-cover-authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issueId,
          file: { originalName: file.name, declaredMime: file.type, size: file.size },
        }),
      });
      if (!authorization.ok) throw new Error('Izin upload sampul ditolak.');
      const target = (await authorization.json()) as {
        fileId: string;
        uploadUrl: string;
        requiredHeaders: Record<string, string>;
      };
      const put = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: target.requiredHeaders,
        body: file,
      });
      if (!put.ok) throw new Error('Upload sampul gagal.');
      const complete = await fetch('/auth/issue-cover-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ issueId, fileId: target.fileId }),
      });
      if (!complete.ok) throw new Error('Finalisasi sampul gagal.');
      setState('Sampul dikarantina dan sedang dipindai. Muat ulang setelah scan selesai.');
      router.refresh();
    } catch (error) {
      setState(error instanceof Error ? error.message : 'Upload sampul gagal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'editorial-action-form'}>
      <label>
        Upload sampul edisi
        <input
          type={'file'}
          accept={'image/jpeg,image/png'}
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      <small>JPEG atau PNG; maksimum 10 MB.</small>
      {state ? <p role={'status'}>{state}</p> : null}
    </div>
  );
}
