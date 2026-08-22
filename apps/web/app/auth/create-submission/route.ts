import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const cookieStore = await cookies();
  const journalId = String(form.get('journalId') ?? '');
  const response = await fetch(`${apiBaseUrl}/journals/${journalId}/submissions`, {
    method: 'POST',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ articleTypeId: String(form.get('articleTypeId') ?? '') }),
    cache: 'no-store',
  });
  if (!response.ok)
    return NextResponse.redirect(new URL('/workspace/submissions/new?error=1', request.url), 303);
  const submission = (await response.json()) as { id: string };
  return NextResponse.redirect(
    new URL(`/workspace/submissions/${submission.id}`, request.url),
    303,
  );
}
