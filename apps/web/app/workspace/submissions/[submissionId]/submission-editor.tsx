'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { RevisionPanel } from './revision-panel';

interface Author {
  givenName: string;
  familyName: string;
  email: string;
  affiliation: string;
  countryCode: string | null;
  orcidId: string | null;
  isCorresponding: boolean;
}

interface SubmissionDraft {
  id: string;
  state: string;
  title: string;
  subtitle: string | null;
  abstract: string;
  coverLetter: string;
  language: string;
  journal: {
    title: string;
    articleTypes: Array<{ id: string; title: string }>;
  };
  articleType: { id: string; title: string };
  authors: Author[];
  keywords: Array<{ value: string }>;
  subjects: Array<{ value: string }>;
  declarations: Array<{
    declarationId: string;
    declarationTitle: string;
    declarationBody: string;
    declarationVersion: number;
    accepted: boolean;
  }>;
  checklistAcceptances: Array<{
    checklistItemId: string;
    labelSnapshot: string;
    accepted: boolean;
  }>;
  timeline: Array<{
    id: string;
    action: string;
    description: string;
    createdAt: string;
  }>;
  screeningDecisions: Array<{
    id: string;
    type: 'REQUEST_CORRECTION' | 'DESK_REJECT';
    authorLetter: string;
    requiredChanges: string[];
    resultingState: string;
    createdAt: string;
  }>;
  editorialDecisions: Array<{
    id: string;
    type: 'REJECT' | 'MAJOR_REVISION' | 'MINOR_REVISION' | 'ACCEPT';
    resultingState: string;
    releasedAt: string;
    revisionDueAt: string | null;
    responseRequired: boolean;
    evaluationMode: string | null;
    targetVersion: { id: string; version: number };
    letter: { subject: string; body: string } | null;
    reviewReleases: Array<{ id: string; commentsToAuthorSnapshot: string }>;
    fileReleases: Array<{
      id: string;
      originalNameSnapshot: string;
      reviewFile: {
        storedFile: {
          id: string;
          size: number;
          detectedMime: string | null;
          scanStatus: string;
        };
      };
    }>;
  }>;
  revisions: Array<{
    id: string;
    responseRequired: boolean;
    responseText: string;
    dueAt: string;
    submittedAt: string | null;
    baseVersion: { id: string; version: number };
    submittedVersion: { id: string; version: number } | null;
    files: Array<{
      purpose: 'MANUSCRIPT' | 'SUPPLEMENTARY' | 'RESPONSE';
      storedFile: {
        id: string;
        originalName: string;
        size: number;
        detectedMime: string | null;
        scanStatus: string;
      };
    }>;
  }>;
  versions: Array<{ id: string; version: number; createdAt: string }>;
  files: Array<{
    id: string;
    purpose: 'MANUSCRIPT' | 'SUPPLEMENTARY' | 'COVER_LETTER' | 'RESPONSE';
    revisionId: string | null;
    storedFile: {
      id: string;
      originalName: string;
      declaredMime: string;
      detectedMime: string | null;
      size: number;
      scanStatus: 'AWAITING_UPLOAD' | 'QUARANTINED' | 'CLEAN' | 'INFECTED' | 'REJECTED';
      visibility: string;
      uploadedAt: string | null;
      scannedAt: string | null;
    };
  }>;
}

const blankAuthor: Author = {
  givenName: '',
  familyName: '',
  email: '',
  affiliation: '',
  countryCode: null,
  orcidId: null,
  isCorresponding: false,
};

export function SubmissionEditor({ initial }: { initial: SubmissionDraft }) {
  const router = useRouter();
  const [articleTypeId, setArticleTypeId] = useState(initial.articleType.id);
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [abstract, setAbstract] = useState(initial.abstract);
  const [coverLetter, setCoverLetter] = useState(initial.coverLetter);
  const [language, setLanguage] = useState(initial.language);
  const [authors, setAuthors] = useState(initial.authors);
  const [keywords, setKeywords] = useState(initial.keywords.map(({ value }) => value).join(', '));
  const [subjects, setSubjects] = useState(initial.subjects.map(({ value }) => value).join(', '));
  const [declarations, setDeclarations] = useState(initial.declarations);
  const [checklist, setChecklist] = useState(initial.checklistAcceptances);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [filePurpose, setFilePurpose] = useState<'MANUSCRIPT' | 'SUPPLEMENTARY' | 'COVER_LETTER'>(
    'MANUSCRIPT',
  );
  const [uploadState, setUploadState] = useState<
    'idle' | 'authorizing' | 'uploading' | 'completing' | 'error'
  >('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [finalizeState, setFinalizeState] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const firstRender = useRef(true);

  const draft = {
    articleTypeId,
    title,
    subtitle: subtitle || null,
    abstract,
    coverLetter,
    language,
    authors,
    keywords: keywords
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    subjects: subjects
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    declarationAcceptances: declarations.map(({ declarationId, accepted }) => ({
      declarationId,
      accepted,
    })),
    checklistAcceptances: checklist.map(({ checklistItemId, accepted }) => ({
      checklistItemId,
      accepted,
    })),
  };

  async function save() {
    setSaveState('saving');
    const response = await fetch('/auth/submission-draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submissionId: initial.id, draft }),
    });
    setSaveState(response.ok ? 'saved' : 'error');
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState('idle');
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
    // The fields below are the canonical autosave dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    articleTypeId,
    title,
    subtitle,
    abstract,
    coverLetter,
    language,
    authors,
    keywords,
    subjects,
    declarations,
    checklist,
  ]);

  useEffect(() => {
    if (
      !initial.files.some(({ storedFile }) =>
        ['AWAITING_UPLOAD', 'QUARANTINED'].includes(storedFile.scanStatus),
      )
    )
      return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [initial.files, router]);

  function submitSave(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  function updateAuthor(index: number, field: keyof Author, value: string | boolean | null) {
    setAuthors((current) =>
      current.map((author, authorIndex) =>
        authorIndex === index ? { ...author, [field]: value } : author,
      ),
    );
  }

  async function uploadSelected(file: File) {
    setUploadState('authorizing');
    setUploadProgress(0);
    const authorization = await fetch('/auth/submission-file-authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        submissionId: initial.id,
        file: {
          originalName: file.name,
          declaredMime: file.type,
          size: file.size,
          purpose: filePurpose,
        },
      }),
    });
    if (!authorization.ok) {
      setUploadState('error');
      return;
    }
    const result = (await authorization.json()) as {
      fileId: string;
      uploadUrl: string;
      requiredHeaders: { 'content-type': string };
    };
    setUploadState('uploading');
    try {
      await new Promise<void>((resolve, reject) => {
        const upload = new XMLHttpRequest();
        upload.open('PUT', result.uploadUrl);
        upload.setRequestHeader('content-type', result.requiredHeaders['content-type']);
        upload.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
        };
        upload.onload = () =>
          upload.status >= 200 && upload.status < 300
            ? resolve()
            : reject(new Error('upload failed'));
        upload.onerror = () => reject(new Error('upload failed'));
        upload.send(file);
      });
      setUploadState('completing');
      const completion = await fetch('/auth/submission-file-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submissionId: initial.id, fileId: result.fileId }),
      });
      if (!completion.ok) throw new Error('completion failed');
      setUploadState('idle');
      router.refresh();
    } catch {
      setUploadState('error');
    }
  }

  async function removeFile(fileId: string) {
    if (!window.confirm('Hapus file ini dari draf dan penyimpanan privat?')) return;
    const response = await fetch('/auth/submission-file-remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submissionId: initial.id, fileId }),
    });
    if (response.ok) router.refresh();
    else setUploadState('error');
  }

  async function finalizeSubmission() {
    if (
      !window.confirm(
        'Kirim submission ke jurnal? Metadata dan file versi pertama akan dibekukan, dan draf tidak dapat diedit lagi.',
      )
    )
      return;
    setFinalizeState('submitting');
    setValidationErrors([]);
    const response = await fetch('/auth/finalize-submission', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submissionId: initial.id, idempotencyKey: crypto.randomUUID() }),
    });
    if (response.ok) {
      router.refresh();
      return;
    }
    const body = (await response.json().catch(() => null)) as {
      error?: { details?: { fields?: string[] } };
    } | null;
    setValidationErrors(body?.error?.details?.fields ?? []);
    setFinalizeState('error');
  }

  if (initial.state !== 'DRAFT')
    return (
      <main id="main-content" className="submission-shell">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Submission {initial.state}</p>
            <h1>{initial.title}</h1>
            <p>
              {initial.journal.title} · {initial.articleType.title}
            </p>
          </div>
          <div className={'workspace-actions'}>
            {['ACCEPTED', 'COPYEDITING', 'PRODUCTION', 'SCHEDULED', 'PUBLISHED'].includes(
              initial.state,
            ) ? (
              <Link className={'button-link'} href={'/production/submissions/' + initial.id}>
                Buka proses produksi
              </Link>
            ) : null}
            <Link className="secondary-button" href="/workspace">
              Kembali
            </Link>
          </div>
        </header>
        <section className="admin-next">
          <h2>Receipt submission</h2>
          <p>
            ID: <code>{initial.id}</code>
          </p>
          <p>Versi pertama telah dibekukan dan submission tidak lagi dapat diedit.</p>
        </section>
        <section className="admin-next">
          <h2>Riwayat</h2>
          <ol className="timeline">
            {initial.timeline.map((event) => (
              <li key={event.id}>
                <strong>{event.description}</strong>
                <time dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString('id-ID')}
                </time>
              </li>
            ))}
          </ol>
        </section>
        {initial.screeningDecisions.length ? (
          <section className="admin-next" aria-labelledby="editorial-decision-heading">
            <h2 id="editorial-decision-heading">Keputusan editorial</h2>
            <ol className="decision-letter-list">
              {initial.screeningDecisions.map((decision) => (
                <li key={decision.id}>
                  <p className="eyebrow">
                    {decision.type === 'REQUEST_CORRECTION'
                      ? 'Koreksi pra-review diperlukan'
                      : 'Desk reject'}
                  </p>
                  <p className="long-form-copy">{decision.authorLetter}</p>
                  {decision.requiredChanges.length ? (
                    <>
                      <h3>Perubahan wajib</h3>
                      <ul>
                        {decision.requiredChanges.map((change) => (
                          <li key={change}>{change}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <time dateTime={decision.createdAt}>
                    {new Date(decision.createdAt).toLocaleString('id-ID')}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {initial.editorialDecisions.length ? (
          <section className={'admin-next'} aria-labelledby={'final-decision-heading'}>
            <h2 id={'final-decision-heading'}>Keputusan dan komentar review</h2>
            <ol className={'decision-letter-list'}>
              {initial.editorialDecisions.map((decision) => (
                <li key={decision.id}>
                  <p className={'eyebrow'}>
                    {decision.type} · versi {decision.targetVersion.version}
                  </p>
                  <h3>{decision.letter?.subject}</h3>
                  <p className={'long-form-copy'}>{decision.letter?.body}</p>
                  {decision.reviewReleases.length ? (
                    <>
                      <h4>Komentar reviewer yang dirilis</h4>
                      <ol>
                        {decision.reviewReleases.map((release) => (
                          <li key={release.id} className={'long-form-copy'}>
                            {release.commentsToAuthorSnapshot}
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                  {decision.fileReleases.length ? (
                    <>
                      <h4>File reviewer yang dirilis</h4>
                      <ul>
                        {decision.fileReleases.map((release) => (
                          <li key={release.id}>
                            <a
                              href={
                                '/auth/decision-download?submissionId=' +
                                initial.id +
                                '&fileId=' +
                                release.reviewFile.storedFile.id
                              }
                            >
                              {release.originalNameSnapshot}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {decision.revisionDueAt ? (
                    <p>
                      Tenggat revisi: {new Date(decision.revisionDueAt).toLocaleString('id-ID')}
                    </p>
                  ) : null}
                  <time dateTime={decision.releasedAt}>
                    {new Date(decision.releasedAt).toLocaleString('id-ID')}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {initial.state === 'REVISION_REQUIRED' && initial.revisions[0] ? (
          <RevisionPanel submissionId={initial.id} revision={initial.revisions[0]} />
        ) : null}
        {initial.versions.length ? (
          <section className={'admin-next'}>
            <h2>Riwayat versi immutable</h2>
            <ol className={'timeline'}>
              {initial.versions.map((version) => (
                <li key={version.id}>
                  <strong>Versi {version.version}</strong>
                  <time dateTime={version.createdAt}>
                    {new Date(version.createdAt).toLocaleString('id-ID')}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>
    );

  return (
    <main id="main-content" className="submission-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Draf submission · {initial.journal.title}</p>
          <h1>{title || 'Draf tanpa judul'}</h1>
          <p>
            {saveState === 'saving'
              ? 'Menyimpan…'
              : saveState === 'saved'
                ? 'Semua perubahan tersimpan.'
                : saveState === 'error'
                  ? 'Perubahan belum tersimpan. Periksa isian dan coba lagi.'
                  : 'Autosave aktif.'}
          </p>
        </div>
        <Link className="secondary-button" href="/workspace">
          Kembali
        </Link>
      </header>
      <div className="submission-layout">
        <nav className="submission-steps" aria-label="Tahap submission">
          <a href="#requirements">1. Persyaratan</a>
          <a href="#details">2. Detail artikel</a>
          <a href="#authors">3. Penulis</a>
          <a href="#files">4. File</a>
          <a href="#declarations">5. Deklarasi</a>
          <a href="#history">6. Riwayat</a>
        </nav>
        <form className="submission-form" onSubmit={submitSave}>
          <section id="requirements" className="admin-next">
            <h2>Persyaratan jurnal</h2>
            {checklist.map((item, index) => (
              <label className="check-row" key={item.checklistItemId}>
                <input
                  type="checkbox"
                  checked={item.accepted}
                  onChange={(event) =>
                    setChecklist((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, accepted: event.target.checked } : entry,
                      ),
                    )
                  }
                />
                <span>{item.labelSnapshot}</span>
              </label>
            ))}
          </section>
          <section id="details" className="admin-next auth-form">
            <h2>Detail artikel</h2>
            <label htmlFor="articleTypeId">Jenis artikel</label>
            <select
              id="articleTypeId"
              value={articleTypeId}
              onChange={(event) => setArticleTypeId(event.target.value)}
            >
              {initial.journal.articleTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.title}
                </option>
              ))}
            </select>
            <label htmlFor="title">Judul</label>
            <input
              id="title"
              value={title}
              maxLength={500}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label htmlFor="subtitle">Subjudul (opsional)</label>
            <input
              id="subtitle"
              value={subtitle}
              maxLength={500}
              onChange={(event) => setSubtitle(event.target.value)}
            />
            <label htmlFor="abstract">Abstrak</label>
            <textarea
              id="abstract"
              value={abstract}
              maxLength={12000}
              rows={10}
              onChange={(event) => setAbstract(event.target.value)}
            />
            <label htmlFor="keywords">Kata kunci</label>
            <input
              id="keywords"
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
            />
            <p className="field-help">Pisahkan kata kunci dengan koma.</p>
            <label htmlFor="subjects">Subjek</label>
            <input
              id="subjects"
              value={subjects}
              onChange={(event) => setSubjects(event.target.value)}
            />
            <label htmlFor="language">Bahasa</label>
            <input
              id="language"
              value={language}
              maxLength={10}
              onChange={(event) => setLanguage(event.target.value)}
            />
            <label htmlFor="coverLetter">Surat pengantar</label>
            <textarea
              id="coverLetter"
              value={coverLetter}
              maxLength={12000}
              rows={6}
              onChange={(event) => setCoverLetter(event.target.value)}
            />
          </section>
          <section id="authors" className="admin-next">
            <div className="section-heading-row">
              <h2>Penulis dan afiliasi</h2>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setAuthors((current) => [...current, { ...blankAuthor }])}
              >
                Tambah penulis
              </button>
            </div>
            {authors.map((author, index) => (
              <fieldset className="author-fieldset" key={index}>
                <legend>Penulis {index + 1}</legend>
                <div className="field-grid">
                  <label>
                    Nama depan
                    <input
                      value={author.givenName}
                      onChange={(event) => updateAuthor(index, 'givenName', event.target.value)}
                    />
                  </label>
                  <label>
                    Nama belakang
                    <input
                      value={author.familyName}
                      onChange={(event) => updateAuthor(index, 'familyName', event.target.value)}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={author.email}
                      onChange={(event) => updateAuthor(index, 'email', event.target.value)}
                    />
                  </label>
                  <label>
                    Afiliasi
                    <input
                      value={author.affiliation}
                      onChange={(event) => updateAuthor(index, 'affiliation', event.target.value)}
                    />
                  </label>
                  <label>
                    Negara
                    <input
                      value={author.countryCode ?? ''}
                      maxLength={2}
                      onChange={(event) =>
                        updateAuthor(index, 'countryCode', event.target.value.toUpperCase() || null)
                      }
                    />
                  </label>
                  <label>
                    ORCID iD
                    <input
                      value={author.orcidId ?? ''}
                      onChange={(event) =>
                        updateAuthor(index, 'orcidId', event.target.value || null)
                      }
                    />
                  </label>
                </div>
                <label className="check-row">
                  <input
                    type="radio"
                    name="corresponding"
                    checked={author.isCorresponding}
                    onChange={() =>
                      setAuthors((current) =>
                        current.map((entry, entryIndex) => ({
                          ...entry,
                          isCorresponding: entryIndex === index,
                        })),
                      )
                    }
                  />
                  <span>Penulis korespondensi</span>
                </label>
                {authors.length > 1 ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      setAuthors((current) =>
                        current.filter((_, entryIndex) => entryIndex !== index),
                      )
                    }
                  >
                    Hapus penulis
                  </button>
                ) : null}
              </fieldset>
            ))}
          </section>
          <section id="declarations" className="admin-next">
            <h2>Deklarasi</h2>
            {declarations.map((declaration, index) => (
              <div className="declaration-row" key={declaration.declarationId}>
                <h3>{declaration.declarationTitle}</h3>
                <p>{declaration.declarationBody}</p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={declaration.accepted}
                    onChange={(event) =>
                      setDeclarations((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, accepted: event.target.checked }
                            : entry,
                        ),
                      )
                    }
                  />
                  <span>Saya menyetujui versi {declaration.declarationVersion}.</span>
                </label>
              </div>
            ))}
          </section>
          <section id="files" className="admin-next">
            <h2>File submission</h2>
            <p className="field-help">
              Format: PDF, DOCX, ODT, TXT, CSV, JPG, atau PNG. Maksimum 25 MB. Semua file bersifat
              privat dan dikarantina sampai pemeriksaan tipe konten serta antivirus selesai.
            </p>
            <div className="field-grid">
              <label>
                Tujuan file
                <select
                  value={filePurpose}
                  onChange={(event) =>
                    setFilePurpose(
                      event.target.value as 'MANUSCRIPT' | 'SUPPLEMENTARY' | 'COVER_LETTER',
                    )
                  }
                >
                  <option value="MANUSCRIPT">Naskah utama</option>
                  <option value="SUPPLEMENTARY">File tambahan</option>
                  <option value="COVER_LETTER">Surat pengantar</option>
                </select>
              </label>
              <label>
                Pilih file
                <input
                  type="file"
                  accept=".pdf,.docx,.odt,.txt,.csv,.jpg,.jpeg,.png"
                  disabled={uploadState !== 'idle' && uploadState !== 'error'}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadSelected(file);
                  }}
                />
              </label>
            </div>
            {uploadState === 'uploading' ? (
              <div role="status">
                <p>Upload {uploadProgress}%</p>
                <progress max={100} value={uploadProgress}>
                  {uploadProgress}%
                </progress>
              </div>
            ) : uploadState === 'authorizing' || uploadState === 'completing' ? (
              <p role="status">
                {uploadState === 'authorizing'
                  ? 'Menyiapkan upload privat…'
                  : 'Memverifikasi upload dan mengantrekan pemindaian…'}
              </p>
            ) : uploadState === 'error' ? (
              <div className="form-error" role="alert">
                Upload gagal. Pastikan penyimpanan tersedia, format diizinkan, dan ukuran tidak
                melebihi 25 MB.
              </div>
            ) : null}
            {initial.files.length ? (
              <ul className="file-list">
                {initial.files.map((file) => (
                  <li key={file.id}>
                    <div>
                      <strong>{file.storedFile.originalName}</strong>
                      <span>
                        {file.purpose} · {(file.storedFile.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <span
                      className={`status-badge status-${file.storedFile.scanStatus.toLowerCase()}`}
                    >
                      {file.storedFile.scanStatus}
                    </span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void removeFile(file.storedFile.id)}
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <h3>Belum ada file</h3>
                <p>Tambahkan naskah utama sebelum finalisasi.</p>
              </div>
            )}
          </section>
          <section id="history" className="admin-next">
            <h2>Riwayat</h2>
            <ol className="timeline">
              {initial.timeline.map((event) => (
                <li key={event.id}>
                  <strong>{event.description}</strong>
                  <time dateTime={event.createdAt}>
                    {new Date(event.createdAt).toLocaleString('id-ID')}
                  </time>
                </li>
              ))}
            </ol>
          </section>
          {saveState === 'error' ? (
            <div className="form-error" role="alert">
              Draf tidak dapat disimpan. Lengkapi nama, email, dan afiliasi setiap penulis; gunakan
              tepat satu penulis korespondensi.
            </div>
          ) : null}
          <button type="submit">Simpan draf sekarang</button>
          <section className="admin-next" aria-labelledby="review-submit-heading">
            <h2 id="review-submit-heading">Tinjau dan kirim</h2>
            <p>
              Finalisasi hanya berhasil setelah metadata lengkap, tepat satu penulis korespondensi,
              seluruh persyaratan wajib diterima, dan semua file—termasuk naskah utama—berstatus
              CLEAN.
            </p>
            {finalizeState === 'error' ? (
              <div className="form-error" role="alert">
                <p>Submission belum dapat dikirim.</p>
                {validationErrors.length ? (
                  <ul>
                    {validationErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              disabled={finalizeState === 'submitting'}
              onClick={() => void finalizeSubmission()}
            >
              {finalizeState === 'submitting' ? 'Mengirim…' : 'Kirim submission'}
            </button>
          </section>
        </form>
      </div>
    </main>
  );
}
