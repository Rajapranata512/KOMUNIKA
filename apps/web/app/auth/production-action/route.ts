import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const submissionId = String(form.get('submissionId') ?? '');
  const publicationId = String(form.get('publicationId') ?? '');
  const cookieStore = await cookies();
  let path = '';
  let body: Record<string, unknown> = {};
  if (action === 'issue') {
    path = '/production/issues';
    body = {
      journalId: String(form.get('journalId')),
      slug: String(form.get('slug')),
      volume: String(form.get('volume')),
      number: String(form.get('number')),
      year: Number(form.get('year')),
      title: String(form.get('title')),
      description: String(form.get('description') ?? ''),
    };
  } else if (action === 'assign') {
    path = '/production/submissions/' + submissionId + '/assignments';
    body = {
      assigneeId: String(form.get('assigneeId')),
      stage: String(form.get('stage')),
      note: String(form.get('note') ?? ''),
    };
  } else if (action === 'prepare') {
    path = '/production/submissions/' + submissionId + '/prepare';
    try {
      body = {
        slug: String(form.get('slug')),
        title: String(form.get('title')),
        subtitle: String(form.get('subtitle') ?? '') || null,
        abstract: String(form.get('abstract')),
        authors: JSON.parse(String(form.get('authors'))),
        keywords: String(form.get('keywords'))
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        language: String(form.get('language')),
        licenseName: String(form.get('licenseName')),
        licenseUrl: String(form.get('licenseUrl')),
        copyrightHolder: String(form.get('copyrightHolder')),
        pages: String(form.get('pages') ?? '') || null,
        eLocator: String(form.get('eLocator') ?? '') || null,
        issueId: String(form.get('issueId') ?? '') || null,
        articleOrder: Number(form.get('articleOrder') ?? 0),
      };
    } catch {
      return NextResponse.redirect(
        new URL('/production/submissions/' + submissionId + '?result=error', request.url),
        303,
      );
    }
  } else if (action === 'query') {
    path = '/production/submissions/' + submissionId + '/queries';
    body = { question: String(form.get('question')) };
  } else if (action === 'answer') {
    path = '/production/queries/' + String(form.get('queryId')) + '/answer';
    body = { response: String(form.get('response')) };
  } else if (action === 'schedule') {
    path = '/production/publications/' + publicationId + '/schedule';
    const raw = String(form.get('scheduledAt') ?? '');
    const utc = new Date(raw.length === 16 ? raw + ':00Z' : raw.endsWith('Z') ? raw : raw + 'Z');
    if (Number.isNaN(utc.getTime()))
      return NextResponse.redirect(
        new URL('/production/submissions/' + submissionId + '?result=error', request.url),
        303,
      );
    body = { scheduledAt: utc.toISOString() };
  } else if (action === 'publish') {
    path = '/production/publications/' + publicationId + '/publish';
    body = { idempotencyKey: String(form.get('idempotencyKey')) };
  } else if (action === 'update') {
    path = '/production/publications/' + publicationId + '/updates';
    body = {
      type: String(form.get('type')),
      reason: String(form.get('reason')),
      notice: String(form.get('notice')),
    };
  } else if (action === 'approve-galley') {
    path = '/production/galleys/' + String(form.get('galleyId')) + '/approve';
  } else if (action === 'approve-cover') {
    path = '/production/issues/' + String(form.get('issueId')) + '/cover/approve';
  } else return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  const response = await fetch(apiBaseUrl + path, {
    method: 'POST',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return NextResponse.redirect(
    new URL(
      '/production/submissions/' + submissionId + '?result=' + (response.ok ? 'success' : 'error'),
      request.url,
    ),
    303,
  );
}
