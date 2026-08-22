import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const revisionId = String(form.get('revisionId') ?? '');
  const submissionId = String(form.get('submissionId') ?? '');
  const cookieStore = await cookies();
  const response = await fetch(apiBaseUrl + '/decisions/revisions/' + revisionId + '/reminders', {
    method: 'POST',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
    },
    cache: 'no-store',
  });
  return NextResponse.redirect(
    new URL(
      '/editorial/submissions/' +
        submissionId +
        '?result=' +
        (response.ok ? 'revision-reminder' : 'error'),
      request.url,
    ),
    303,
  );
}
