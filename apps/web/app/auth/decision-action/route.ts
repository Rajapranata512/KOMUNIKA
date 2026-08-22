import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const submissionId = String(form.get('submissionId') ?? '');
  const type = String(form.get('type') ?? '');
  if (!submissionId || !['REJECT', 'MAJOR_REVISION', 'MINOR_REVISION', 'ACCEPT'].includes(type))
    return NextResponse.redirect(new URL('/editorial?error=invalid', request.url), 303);
  const revisionType = type === 'MAJOR_REVISION' || type === 'MINOR_REVISION';
  const rawDueAt = String(form.get('revisionDueAt') ?? '');
  const dueAt = revisionType ? new Date(rawDueAt) : null;
  if (revisionType && (!dueAt || Number.isNaN(dueAt.getTime())))
    return NextResponse.redirect(
      new URL('/editorial/submissions/' + submissionId + '?result=error', request.url),
      303,
    );
  const cookieStore = await cookies();
  const response = await fetch(apiBaseUrl + '/decisions/submissions/' + submissionId, {
    method: 'POST',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type,
      reason: String(form.get('reason') ?? ''),
      subject: String(form.get('subject') ?? ''),
      body: String(form.get('body') ?? ''),
      ...(revisionType
        ? {
            revisionDueAt: dueAt?.toISOString(),
            responseRequired: form.get('responseRequired') === 'on',
            evaluationMode: String(form.get('evaluationMode') ?? ''),
          }
        : { responseRequired: false }),
      releaseResponseIds: form.getAll('releaseResponseIds').map(String),
      releaseReviewFileIds: form.getAll('releaseReviewFileIds').map(String),
    }),
    cache: 'no-store',
  });
  return NextResponse.redirect(
    new URL(
      '/editorial/submissions/' +
        submissionId +
        '?result=' +
        (response.ok ? 'decision-released' : 'error'),
      request.url,
    ),
    303,
  );
}
