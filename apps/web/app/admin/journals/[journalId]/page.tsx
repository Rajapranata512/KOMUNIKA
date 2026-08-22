import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

interface JournalSettingsPageProps {
  params: Promise<{ journalId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}

interface ManagedJournal {
  id: string;
  slug: string;
  title: string;
  abbreviation: string;
  description: string;
  scope: string;
  contactEmail: string;
  printIssn: string | null;
  electronicIssn: string | null;
  primaryLanguage: string;
  reviewModel: 'SINGLE_ANONYMOUS' | 'DOUBLE_ANONYMOUS';
  status: 'DRAFT' | 'PUBLISHED';
  submissionsOpen: boolean;
  sections: Array<{
    id: string;
    slug: string;
    title: string;
    description: string;
    sortOrder: number;
    isActive: boolean;
  }>;
  articleTypes: Array<{
    id: string;
    slug: string;
    title: string;
    description: string;
    sectionId: string | null;
    peerReviewRequired: boolean;
    sortOrder: number;
    isActive: boolean;
  }>;
  checklistItems: Array<{
    id: string;
    label: string;
    isRequired: boolean;
    sortOrder: number;
    isActive: boolean;
  }>;
  declarations: Array<{
    id: string;
    code: string;
    version: number;
    title: string;
    body: string;
    isRequired: boolean;
    isActive: boolean;
  }>;
  templates: Array<{
    id: string;
    kind:
      | 'AUTHOR_GUIDELINES'
      | 'MANUSCRIPT_TEMPLATE'
      | 'COPYRIGHT_NOTICE'
      | 'DECISION_REJECT'
      | 'DECISION_MAJOR_REVISION'
      | 'DECISION_MINOR_REVISION'
      | 'DECISION_ACCEPT';
    slug: string;
    title: string;
    body: string;
    sortOrder: number;
    isActive: boolean;
  }>;
  reviewForms: Array<{
    id: string;
    name: string;
    version: number;
    sectionId: string | null;
    isActive: boolean;
    questions: Array<{
      id: string;
      prompt: string;
      type: string;
      required: boolean;
      sortOrder: number;
    }>;
  }>;
}

const errorCopy: Record<string, string> = {
  update: 'Identitas jurnal tidak dapat disimpan.',
  section: 'Seksi jurnal tidak dapat disimpan.',
  type: 'Jenis artikel tidak dapat disimpan.',
  checklist: 'Checklist pengajuan tidak dapat disimpan.',
  declaration: 'Deklarasi tidak dapat disimpan.',
  template: 'Template tidak dapat disimpan.',
  'review-form': 'Form peer review tidak dapat disimpan.',
};

export default async function JournalSettingsPage({
  params,
  searchParams,
}: JournalSettingsPageProps) {
  const { journalId } = await params;
  const query = await searchParams;
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/admin/journals/${encodeURIComponent(journalId)}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 403 || response.status === 404) notFound();
  if (!response.ok) throw new Error('Journal configuration could not be loaded.');
  const journal = (await response.json()) as ManagedJournal;
  const activeDeclarations = journal.declarations.filter((item) => item.isActive);
  return (
    <main id={'main-content'} className={'admin-shell'}>
      <header className={'admin-header'}>
        <div>
          <p className={'eyebrow'}>Konfigurasi jurnal</p>
          <h1>{journal.title}</h1>
          <p>
            Pengaturan tenant ini hanya berlaku untuk {journal.abbreviation} dan tidak mengubah
            jurnal lain.
          </p>
        </div>
        <a className={'secondary-action'} href={'/admin/journals'}>
          Semua jurnal
        </a>
      </header>
      {query.saved ? <p className={'form-success'}>Perubahan konfigurasi telah disimpan.</p> : null}
      {query.error ? (
        <p className={'form-error'}>
          {errorCopy[query.error] ?? 'Permintaan tidak dapat diproses.'}
        </p>
      ) : null}

      <nav className={'journal-config-nav'} aria-label={'Bagian konfigurasi jurnal'}>
        <a href={'#identity-heading'}>Identitas</a>
        <a href={'#sections-heading'}>Seksi</a>
        <a href={'#article-types-heading'}>Jenis artikel</a>
        <a href={'#checklist-heading'}>Checklist</a>
        <a href={'#declarations-heading'}>Deklarasi</a>
        <a href={'#templates-heading'}>Template</a>
        <a href={'#review-forms-heading'}>Form review</a>
      </nav>

      <section className={'admin-next'} aria-labelledby={'identity-heading'}>
        <h2 id={'identity-heading'}>Identitas dan kebijakan review</h2>
        <form action={'/auth/journal-config'} method={'post'} className={'auth-form'}>
          <input type={'hidden'} name={'action'} value={'update-journal'} />
          <input type={'hidden'} name={'journalId'} value={journal.id} />
          <label htmlFor={'title'}>Nama jurnal</label>
          <input id={'title'} name={'title'} required minLength={3} defaultValue={journal.title} />
          <label htmlFor={'slug'}>Slug</label>
          <input
            id={'slug'}
            name={'slug'}
            required
            pattern={'[a-z0-9]+(?:-[a-z0-9]+)*'}
            defaultValue={journal.slug}
          />
          <label htmlFor={'abbreviation'}>Singkatan</label>
          <input
            id={'abbreviation'}
            name={'abbreviation'}
            required
            defaultValue={journal.abbreviation}
          />
          <label htmlFor={'description'}>Deskripsi</label>
          <textarea
            id={'description'}
            name={'description'}
            required
            minLength={20}
            defaultValue={journal.description}
          />
          <label htmlFor={'scope'}>Fokus dan ruang lingkup</label>
          <textarea
            id={'scope'}
            name={'scope'}
            required
            minLength={20}
            defaultValue={journal.scope}
          />
          <label htmlFor={'contactEmail'}>Email kontak</label>
          <input
            id={'contactEmail'}
            name={'contactEmail'}
            type={'email'}
            required
            defaultValue={journal.contactEmail}
          />
          <label htmlFor={'printIssn'}>ISSN cetak</label>
          <input id={'printIssn'} name={'printIssn'} defaultValue={journal.printIssn ?? ''} />
          <label htmlFor={'electronicIssn'}>ISSN elektronik</label>
          <input
            id={'electronicIssn'}
            name={'electronicIssn'}
            defaultValue={journal.electronicIssn ?? ''}
          />
          <label htmlFor={'primaryLanguage'}>Bahasa utama</label>
          <input
            id={'primaryLanguage'}
            name={'primaryLanguage'}
            required
            defaultValue={journal.primaryLanguage}
          />
          <label htmlFor={'reviewModel'}>Model review</label>
          <select id={'reviewModel'} name={'reviewModel'} defaultValue={journal.reviewModel}>
            <option value={'DOUBLE_ANONYMOUS'}>Double-anonymous</option>
            <option value={'SINGLE_ANONYMOUS'}>Single-anonymous</option>
          </select>
          <label htmlFor={'status'}>Status publikasi</label>
          <select id={'status'} name={'status'} defaultValue={journal.status}>
            <option value={'DRAFT'}>Draft</option>
            <option value={'PUBLISHED'}>Published</option>
          </select>
          <label className={'checkbox-row'}>
            <input
              name={'submissionsOpen'}
              type={'checkbox'}
              value={'true'}
              defaultChecked={journal.submissionsOpen}
            />
            Buka pengajuan naskah
          </label>
          <button type={'submit'}>Simpan identitas jurnal</button>
        </form>
      </section>

      <section className={'admin-next'} aria-labelledby={'sections-heading'}>
        <h2 id={'sections-heading'}>Seksi jurnal</h2>
        <form action={'/auth/journal-config'} method={'post'} className={'auth-form'}>
          <input type={'hidden'} name={'action'} value={'create-section'} />
          <input type={'hidden'} name={'journalId'} value={journal.id} />
          <label htmlFor={'section-title'}>Nama seksi</label>
          <input id={'section-title'} name={'title'} required minLength={2} />
          <label htmlFor={'section-slug'}>Slug</label>
          <input id={'section-slug'} name={'slug'} required pattern={'[a-z0-9]+(?:-[a-z0-9]+)*'} />
          <label htmlFor={'section-description'}>Deskripsi</label>
          <textarea id={'section-description'} name={'description'} />
          <label htmlFor={'section-sort'}>Urutan</label>
          <input id={'section-sort'} name={'sortOrder'} type={'number'} min={0} defaultValue={0} />
          <label className={'checkbox-row'}>
            <input name={'isActive'} type={'checkbox'} value={'true'} defaultChecked /> Aktif
          </label>
          <button type={'submit'}>Tambah seksi</button>
        </form>
        {journal.sections.length ? (
          <div className={'config-list'}>
            {journal.sections.map((section) => (
              <form
                key={section.id}
                action={'/auth/journal-config'}
                method={'post'}
                className={'auth-form config-item-form'}
              >
                <input type={'hidden'} name={'action'} value={'update-section'} />
                <input type={'hidden'} name={'journalId'} value={journal.id} />
                <input type={'hidden'} name={'sectionId'} value={section.id} />
                <label htmlFor={`section-title-${section.id}`}>Nama seksi</label>
                <input
                  id={`section-title-${section.id}`}
                  name={'title'}
                  required
                  defaultValue={section.title}
                />
                <label htmlFor={`section-slug-${section.id}`}>Slug</label>
                <input
                  id={`section-slug-${section.id}`}
                  name={'slug'}
                  required
                  defaultValue={section.slug}
                />
                <label htmlFor={`section-description-${section.id}`}>Deskripsi</label>
                <textarea
                  id={`section-description-${section.id}`}
                  name={'description'}
                  defaultValue={section.description}
                />
                <label htmlFor={`section-sort-${section.id}`}>Urutan</label>
                <input
                  id={`section-sort-${section.id}`}
                  name={'sortOrder'}
                  type={'number'}
                  min={0}
                  defaultValue={section.sortOrder}
                />
                <label className={'checkbox-row'}>
                  <input
                    name={'isActive'}
                    type={'checkbox'}
                    value={'true'}
                    defaultChecked={section.isActive}
                  />
                  Aktif
                </label>
                <button className={'secondary-button'} type={'submit'}>
                  Perbarui seksi
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p>Belum ada seksi.</p>
        )}
      </section>

      <section className={'admin-next'} aria-labelledby={'article-types-heading'}>
        <h2 id={'article-types-heading'}>Jenis artikel</h2>
        <form action={'/auth/journal-config'} method={'post'} className={'auth-form'}>
          <input type={'hidden'} name={'action'} value={'create-article-type'} />
          <input type={'hidden'} name={'journalId'} value={journal.id} />
          <label htmlFor={'type-title'}>Nama jenis</label>
          <input id={'type-title'} name={'title'} required minLength={2} />
          <label htmlFor={'type-slug'}>Slug</label>
          <input id={'type-slug'} name={'slug'} required pattern={'[a-z0-9]+(?:-[a-z0-9]+)*'} />
          <label htmlFor={'type-section'}>Seksi</label>
          <select id={'type-section'} name={'sectionId'} defaultValue={''}>
            <option value={''}>Tanpa seksi khusus</option>
            {journal.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>
          <label htmlFor={'type-description'}>Deskripsi</label>
          <textarea id={'type-description'} name={'description'} />
          <label htmlFor={'type-sort'}>Urutan</label>
          <input id={'type-sort'} name={'sortOrder'} type={'number'} min={0} defaultValue={0} />
          <label className={'checkbox-row'}>
            <input name={'peerReviewRequired'} type={'checkbox'} value={'true'} defaultChecked />
            Wajib peer review
          </label>
          <label className={'checkbox-row'}>
            <input name={'isActive'} type={'checkbox'} value={'true'} defaultChecked /> Aktif
          </label>
          <button type={'submit'}>Tambah jenis artikel</button>
        </form>
        {journal.articleTypes.length ? (
          <div className={'config-list'}>
            {journal.articleTypes.map((articleType) => (
              <form
                key={articleType.id}
                action={'/auth/journal-config'}
                method={'post'}
                className={'auth-form config-item-form'}
              >
                <input type={'hidden'} name={'action'} value={'update-article-type'} />
                <input type={'hidden'} name={'journalId'} value={journal.id} />
                <input type={'hidden'} name={'articleTypeId'} value={articleType.id} />
                <label htmlFor={`type-title-${articleType.id}`}>Nama jenis</label>
                <input
                  id={`type-title-${articleType.id}`}
                  name={'title'}
                  required
                  defaultValue={articleType.title}
                />
                <label htmlFor={`type-slug-${articleType.id}`}>Slug</label>
                <input
                  id={`type-slug-${articleType.id}`}
                  name={'slug'}
                  required
                  defaultValue={articleType.slug}
                />
                <label htmlFor={`type-section-${articleType.id}`}>Seksi</label>
                <select
                  id={`type-section-${articleType.id}`}
                  name={'sectionId'}
                  defaultValue={articleType.sectionId ?? ''}
                >
                  <option value={''}>Tanpa seksi khusus</option>
                  {journal.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.title}
                    </option>
                  ))}
                </select>
                <label htmlFor={`type-description-${articleType.id}`}>Deskripsi</label>
                <textarea
                  id={`type-description-${articleType.id}`}
                  name={'description'}
                  defaultValue={articleType.description}
                />
                <label htmlFor={`type-sort-${articleType.id}`}>Urutan</label>
                <input
                  id={`type-sort-${articleType.id}`}
                  name={'sortOrder'}
                  type={'number'}
                  min={0}
                  defaultValue={articleType.sortOrder}
                />
                <label className={'checkbox-row'}>
                  <input
                    name={'peerReviewRequired'}
                    type={'checkbox'}
                    value={'true'}
                    defaultChecked={articleType.peerReviewRequired}
                  />
                  Wajib peer review
                </label>
                <label className={'checkbox-row'}>
                  <input
                    name={'isActive'}
                    type={'checkbox'}
                    value={'true'}
                    defaultChecked={articleType.isActive}
                  />
                  Aktif
                </label>
                <button className={'secondary-button'} type={'submit'}>
                  Perbarui jenis artikel
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p>Belum ada jenis artikel.</p>
        )}
      </section>

      <section className={'admin-next'} aria-labelledby={'checklist-heading'}>
        <h2 id={'checklist-heading'}>Checklist pengajuan</h2>
        <form action={'/auth/journal-config'} method={'post'} className={'auth-form'}>
          <input type={'hidden'} name={'action'} value={'create-checklist-item'} />
          <input type={'hidden'} name={'journalId'} value={journal.id} />
          <label htmlFor={'checklist-label'}>Butir checklist</label>
          <textarea id={'checklist-label'} name={'label'} required minLength={8} />
          <label htmlFor={'checklist-sort'}>Urutan</label>
          <input
            id={'checklist-sort'}
            name={'sortOrder'}
            type={'number'}
            min={0}
            defaultValue={0}
          />
          <label className={'checkbox-row'}>
            <input name={'isRequired'} type={'checkbox'} value={'true'} defaultChecked /> Wajib
          </label>
          <label className={'checkbox-row'}>
            <input name={'isActive'} type={'checkbox'} value={'true'} defaultChecked /> Aktif
          </label>
          <button type={'submit'}>Tambah butir</button>
        </form>
        {journal.checklistItems.length ? (
          <div className={'config-list'}>
            {journal.checklistItems.map((item) => (
              <form
                key={item.id}
                action={'/auth/journal-config'}
                method={'post'}
                className={'auth-form config-item-form'}
              >
                <input type={'hidden'} name={'action'} value={'update-checklist-item'} />
                <input type={'hidden'} name={'journalId'} value={journal.id} />
                <input type={'hidden'} name={'itemId'} value={item.id} />
                <label htmlFor={`checklist-label-${item.id}`}>Butir checklist</label>
                <textarea
                  id={`checklist-label-${item.id}`}
                  name={'label'}
                  required
                  minLength={8}
                  defaultValue={item.label}
                />
                <label htmlFor={`checklist-sort-${item.id}`}>Urutan</label>
                <input
                  id={`checklist-sort-${item.id}`}
                  name={'sortOrder'}
                  type={'number'}
                  min={0}
                  defaultValue={item.sortOrder}
                />
                <label className={'checkbox-row'}>
                  <input
                    name={'isRequired'}
                    type={'checkbox'}
                    value={'true'}
                    defaultChecked={item.isRequired}
                  />
                  Wajib
                </label>
                <label className={'checkbox-row'}>
                  <input
                    name={'isActive'}
                    type={'checkbox'}
                    value={'true'}
                    defaultChecked={item.isActive}
                  />
                  Aktif
                </label>
                <button className={'secondary-button'} type={'submit'}>
                  Perbarui butir
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p>Belum ada checklist.</p>
        )}
      </section>

      <section className={'admin-next'} aria-labelledby={'declarations-heading'}>
        <h2 id={'declarations-heading'}>Deklarasi dan kebijakan</h2>
        <p>
          Perubahan teks deklarasi menyimpan versi baru. Versi lama tetap ada agar persetujuan
          penulis tidak berubah secara diam-diam.
        </p>
        <form action={'/auth/journal-config'} method={'post'} className={'auth-form'}>
          <input type={'hidden'} name={'action'} value={'create-declaration'} />
          <input type={'hidden'} name={'journalId'} value={journal.id} />
          <label htmlFor={'declaration-code'}>Kode</label>
          <input
            id={'declaration-code'}
            name={'code'}
            required
            pattern={'[a-z0-9]+(?:-[a-z0-9]+)*'}
          />
          <label htmlFor={'declaration-title'}>Judul</label>
          <input id={'declaration-title'} name={'title'} required minLength={3} />
          <label htmlFor={'declaration-body'}>Teks kebijakan</label>
          <textarea id={'declaration-body'} name={'body'} required minLength={20} />
          <label className={'checkbox-row'}>
            <input name={'isRequired'} type={'checkbox'} value={'true'} defaultChecked /> Wajib
          </label>
          <label className={'checkbox-row'}>
            <input name={'isActive'} type={'checkbox'} value={'true'} defaultChecked /> Aktif
          </label>
          <button type={'submit'}>Tambah deklarasi</button>
        </form>
        {activeDeclarations.length ? (
          <div className={'config-list'}>
            {activeDeclarations.map((declaration) => (
              <form
                key={declaration.id}
                action={'/auth/journal-config'}
                method={'post'}
                className={'auth-form config-item-form'}
              >
                <input type={'hidden'} name={'action'} value={'update-declaration'} />
                <input type={'hidden'} name={'journalId'} value={journal.id} />
                <input type={'hidden'} name={'declarationId'} value={declaration.id} />
                <p>
                  {declaration.code} · versi {declaration.version}
                </p>
                <label htmlFor={`declaration-title-${declaration.id}`}>Judul</label>
                <input
                  id={`declaration-title-${declaration.id}`}
                  name={'title'}
                  required
                  defaultValue={declaration.title}
                />
                <label htmlFor={`declaration-body-${declaration.id}`}>Teks kebijakan</label>
                <textarea
                  id={`declaration-body-${declaration.id}`}
                  name={'body'}
                  required
                  minLength={20}
                  defaultValue={declaration.body}
                />
                <label className={'checkbox-row'}>
                  <input
                    name={'isRequired'}
                    type={'checkbox'}
                    value={'true'}
                    defaultChecked={declaration.isRequired}
                  />
                  Wajib
                </label>
                <label className={'checkbox-row'}>
                  <input
                    name={'isActive'}
                    type={'checkbox'}
                    value={'true'}
                    defaultChecked={declaration.isActive}
                  />
                  Aktif
                </label>
                <button className={'secondary-button'} type={'submit'}>
                  Simpan versi deklarasi
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p>Belum ada deklarasi aktif.</p>
        )}
      </section>

      <section className={'admin-next'} aria-labelledby={'templates-heading'}>
        <h2 id={'templates-heading'}>Template</h2>
        <form action={'/auth/journal-config'} method={'post'} className={'auth-form'}>
          <input type={'hidden'} name={'action'} value={'create-template'} />
          <input type={'hidden'} name={'journalId'} value={journal.id} />
          <label htmlFor={'template-kind'}>Jenis template</label>
          <select id={'template-kind'} name={'kind'} defaultValue={'AUTHOR_GUIDELINES'}>
            <option value={'AUTHOR_GUIDELINES'}>Pedoman penulis</option>
            <option value={'MANUSCRIPT_TEMPLATE'}>Template naskah</option>
            <option value={'COPYRIGHT_NOTICE'}>Pernyataan hak cipta</option>
            <option value={'DECISION_REJECT'}>Surat keputusan: reject</option>
            <option value={'DECISION_MAJOR_REVISION'}>Surat keputusan: revisi mayor</option>
            <option value={'DECISION_MINOR_REVISION'}>Surat keputusan: revisi minor</option>
            <option value={'DECISION_ACCEPT'}>Surat keputusan: accept</option>
          </select>
          <label htmlFor={'template-title'}>Judul</label>
          <input id={'template-title'} name={'title'} required minLength={3} />
          <label htmlFor={'template-slug'}>Slug</label>
          <input id={'template-slug'} name={'slug'} required pattern={'[a-z0-9]+(?:-[a-z0-9]+)*'} />
          <label htmlFor={'template-body'}>Isi</label>
          <textarea id={'template-body'} name={'body'} required minLength={20} />
          <label htmlFor={'template-sort'}>Urutan</label>
          <input id={'template-sort'} name={'sortOrder'} type={'number'} min={0} defaultValue={0} />
          <label className={'checkbox-row'}>
            <input name={'isActive'} type={'checkbox'} value={'true'} defaultChecked /> Aktif
          </label>
          <button type={'submit'}>Tambah template</button>
        </form>
        {journal.templates.length ? (
          <div className={'config-list'}>
            {journal.templates.map((template) => (
              <form
                key={template.id}
                action={'/auth/journal-config'}
                method={'post'}
                className={'auth-form config-item-form'}
              >
                <input type={'hidden'} name={'action'} value={'update-template'} />
                <input type={'hidden'} name={'journalId'} value={journal.id} />
                <input type={'hidden'} name={'templateId'} value={template.id} />
                <label htmlFor={`template-kind-${template.id}`}>Jenis template</label>
                <select
                  id={`template-kind-${template.id}`}
                  name={'kind'}
                  defaultValue={template.kind}
                >
                  <option value={'AUTHOR_GUIDELINES'}>Pedoman penulis</option>
                  <option value={'MANUSCRIPT_TEMPLATE'}>Template naskah</option>
                  <option value={'COPYRIGHT_NOTICE'}>Pernyataan hak cipta</option>
                  <option value={'DECISION_REJECT'}>Surat keputusan: reject</option>
                  <option value={'DECISION_MAJOR_REVISION'}>Surat keputusan: revisi mayor</option>
                  <option value={'DECISION_MINOR_REVISION'}>Surat keputusan: revisi minor</option>
                  <option value={'DECISION_ACCEPT'}>Surat keputusan: accept</option>
                </select>
                <label htmlFor={`template-title-${template.id}`}>Judul</label>
                <input
                  id={`template-title-${template.id}`}
                  name={'title'}
                  required
                  defaultValue={template.title}
                />
                <label htmlFor={`template-slug-${template.id}`}>Slug</label>
                <input
                  id={`template-slug-${template.id}`}
                  name={'slug'}
                  required
                  defaultValue={template.slug}
                />
                <label htmlFor={`template-body-${template.id}`}>Isi</label>
                <textarea
                  id={`template-body-${template.id}`}
                  name={'body'}
                  required
                  minLength={20}
                  defaultValue={template.body}
                />
                <label htmlFor={`template-sort-${template.id}`}>Urutan</label>
                <input
                  id={`template-sort-${template.id}`}
                  name={'sortOrder'}
                  type={'number'}
                  min={0}
                  defaultValue={template.sortOrder}
                />
                <label className={'checkbox-row'}>
                  <input
                    name={'isActive'}
                    type={'checkbox'}
                    value={'true'}
                    defaultChecked={template.isActive}
                  />
                  Aktif
                </label>
                <button className={'secondary-button'} type={'submit'}>
                  Perbarui template
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p>Belum ada template.</p>
        )}
      </section>

      <section className={'admin-next'} aria-labelledby={'review-forms-heading'}>
        <h2 id={'review-forms-heading'}>Form peer review</h2>
        <p>
          Setiap penyimpanan dengan nama yang sama membuat versi baru dan menonaktifkan versi
          sebelumnya.
        </p>
        <form action={'/auth/journal-config'} method={'post'} className={'auth-form'}>
          <input type={'hidden'} name={'action'} value={'create-review-form'} />
          <input type={'hidden'} name={'journalId'} value={journal.id} />
          <label htmlFor={'review-form-name'}>Nama form</label>
          <input id={'review-form-name'} name={'name'} required minLength={3} />
          <label htmlFor={'review-form-section'}>Seksi (opsional)</label>
          <select id={'review-form-section'} name={'sectionId'} defaultValue={''}>
            <option value={''}>Semua seksi</option>
            {journal.sections
              .filter(({ isActive }) => isActive)
              .map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
          </select>
          <label htmlFor={'review-form-questions'}>Pertanyaan wajib (satu per baris)</label>
          <textarea
            id={'review-form-questions'}
            name={'questions'}
            required
            minLength={5}
            rows={7}
          />
          <button type={'submit'}>Buat versi form review</button>
        </form>
        {journal.reviewForms.length ? (
          <div className={'config-list'}>
            {journal.reviewForms.map((form) => (
              <article key={form.id} className={'config-item-form'}>
                <h3>
                  {form.name} · versi {form.version}
                </h3>
                <p>
                  {form.isActive ? 'Aktif' : 'Arsip'} ·{' '}
                  {form.sectionId ? 'Khusus seksi' : 'Semua seksi'}
                </p>
                <ol>
                  {form.questions.map((question) => (
                    <li key={question.id}>{question.prompt}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        ) : (
          <p>Belum ada form review. Buat sedikitnya satu sebelum mengundang reviewer.</p>
        )}
      </section>
    </main>
  );
}
