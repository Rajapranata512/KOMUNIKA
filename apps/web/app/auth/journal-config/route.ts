import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

function text(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim();
}

function optionalText(form: FormData, name: string) {
  return text(form, name) || undefined;
}

function flag(form: FormData, name: string) {
  return form.get(name) === 'true';
}

function sortOrder(form: FormData) {
  const value = Number(text(form, 'sortOrder') || '0');
  return Number.isInteger(value) ? value : 0;
}

function redirectTo(request: NextRequest, journalId: string, ok: boolean, error: string) {
  const path = `/admin/journals/${encodeURIComponent(journalId)}`;
  return NextResponse.redirect(
    new URL(ok ? `${path}?saved=1` : `${path}?error=${error}`, request.url),
    303,
  );
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = text(form, 'action');
  const journalId = text(form, 'journalId');
  const cookieStore = await cookies();
  const headers = {
    cookie: cookieStore.toString(),
    'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
    'content-type': 'application/json',
  };

  const send = (method: string, path: string, body: unknown) =>
    fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

  if (!journalId) {
    return NextResponse.redirect(new URL('/admin/journals?error=update', request.url), 303);
  }

  if (action === 'update-journal') {
    const response = await send('PATCH', `/admin/journals/${encodeURIComponent(journalId)}`, {
      title: text(form, 'title'),
      slug: text(form, 'slug'),
      abbreviation: text(form, 'abbreviation'),
      description: text(form, 'description'),
      scope: text(form, 'scope'),
      contactEmail: text(form, 'contactEmail'),
      printIssn: optionalText(form, 'printIssn') ?? null,
      electronicIssn: optionalText(form, 'electronicIssn') ?? null,
      primaryLanguage: text(form, 'primaryLanguage'),
      reviewModel: text(form, 'reviewModel'),
      status: text(form, 'status'),
      submissionsOpen: flag(form, 'submissionsOpen'),
    });
    return redirectTo(request, journalId, response.ok, 'update');
  }

  if (action === 'create-section' || action === 'update-section') {
    const body = {
      slug: text(form, 'slug'),
      title: text(form, 'title'),
      description: optionalText(form, 'description') ?? '',
      sortOrder: sortOrder(form),
      isActive: flag(form, 'isActive'),
    };
    const sectionId = text(form, 'sectionId');
    const response = await send(
      action === 'create-section' ? 'POST' : 'PATCH',
      action === 'create-section'
        ? `/admin/journals/${encodeURIComponent(journalId)}/sections`
        : `/admin/journals/${encodeURIComponent(journalId)}/sections/${encodeURIComponent(sectionId)}`,
      body,
    );
    return redirectTo(request, journalId, response.ok, 'section');
  }

  if (action === 'create-article-type' || action === 'update-article-type') {
    const sectionId = text(form, 'sectionId');
    const body = {
      slug: text(form, 'slug'),
      title: text(form, 'title'),
      description: optionalText(form, 'description') ?? '',
      sectionId: sectionId || null,
      peerReviewRequired: flag(form, 'peerReviewRequired'),
      sortOrder: sortOrder(form),
      isActive: flag(form, 'isActive'),
    };
    const articleTypeId = text(form, 'articleTypeId');
    const response = await send(
      action === 'create-article-type' ? 'POST' : 'PATCH',
      action === 'create-article-type'
        ? `/admin/journals/${encodeURIComponent(journalId)}/article-types`
        : `/admin/journals/${encodeURIComponent(journalId)}/article-types/${encodeURIComponent(articleTypeId)}`,
      body,
    );
    return redirectTo(request, journalId, response.ok, 'type');
  }

  if (action === 'create-checklist-item' || action === 'update-checklist-item') {
    const body = {
      label: text(form, 'label'),
      isRequired: flag(form, 'isRequired'),
      sortOrder: sortOrder(form),
      isActive: flag(form, 'isActive'),
    };
    const itemId = text(form, 'itemId');
    const response = await send(
      action === 'create-checklist-item' ? 'POST' : 'PATCH',
      action === 'create-checklist-item'
        ? `/admin/journals/${encodeURIComponent(journalId)}/checklist-items`
        : `/admin/journals/${encodeURIComponent(journalId)}/checklist-items/${encodeURIComponent(itemId)}`,
      body,
    );
    return redirectTo(request, journalId, response.ok, 'checklist');
  }

  if (action === 'create-declaration' || action === 'update-declaration') {
    const body =
      action === 'create-declaration'
        ? {
            code: text(form, 'code'),
            title: text(form, 'title'),
            body: text(form, 'body'),
            isRequired: flag(form, 'isRequired'),
            isActive: flag(form, 'isActive'),
          }
        : {
            title: text(form, 'title'),
            body: text(form, 'body'),
            isRequired: flag(form, 'isRequired'),
            isActive: flag(form, 'isActive'),
          };
    const declarationId = text(form, 'declarationId');
    const response = await send(
      action === 'create-declaration' ? 'POST' : 'PATCH',
      action === 'create-declaration'
        ? `/admin/journals/${encodeURIComponent(journalId)}/declarations`
        : `/admin/journals/${encodeURIComponent(journalId)}/declarations/${encodeURIComponent(declarationId)}`,
      body,
    );
    return redirectTo(request, journalId, response.ok, 'declaration');
  }

  if (action === 'create-template' || action === 'update-template') {
    const body = {
      kind: text(form, 'kind'),
      slug: text(form, 'slug'),
      title: text(form, 'title'),
      body: text(form, 'body'),
      sortOrder: sortOrder(form),
      isActive: flag(form, 'isActive'),
    };
    const templateId = text(form, 'templateId');
    const response = await send(
      action === 'create-template' ? 'POST' : 'PATCH',
      action === 'create-template'
        ? `/admin/journals/${encodeURIComponent(journalId)}/templates`
        : `/admin/journals/${encodeURIComponent(journalId)}/templates/${encodeURIComponent(templateId)}`,
      body,
    );
    return redirectTo(request, journalId, response.ok, 'template');
  }

  return redirectTo(request, journalId, false, 'update');
}
