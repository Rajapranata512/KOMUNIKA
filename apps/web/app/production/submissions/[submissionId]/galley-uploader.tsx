'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export function GalleyUploader({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    setState('Meminta izin upload…');
    try {
      const authorization = await fetch('/auth/galley-file-authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          versionId,
          file: {
            originalName: file.name,
            size: file.size,
            format: 'PDF',
            label: 'PDF',
            locale: 'id',
          },
        }),
      });
      if (!authorization.ok) throw new Error('Izin upload ditolak.');
      const target = (await authorization.json()) as {
        fileId: string;
        uploadUrl: string;
        requiredHeaders: Record<string, string>;
      };
      setState('Mengunggah galley…');
      const put = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: target.requiredHeaders,
        body: file,
      });
      if (!put.ok) throw new Error('Upload gagal.');
      const complete = await fetch('/auth/galley-file-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionId, fileId: target.fileId }),
      });
      if (!complete.ok) throw new Error('Finalisasi upload gagal.');
      setState('Galley dikarantina dan sedang dipindai. Muat ulang setelah scan selesai.');
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
        Upload galley PDF
        <input
          type={'file'}
          accept={'application/pdf'}
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      {state ? <p role={'status'}>{state}</p> : null}
    </div>
  );
}
