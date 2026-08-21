import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const input = (await request.json()) as {
    action?: string;
    revisionId?: string;
    responseText?: string;
    idempotencyKey?: string;
  };
  if (!input.revisionId || !['save', 'finalize'].includes(input.action ?? ''))
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const cookieStore = await cookies();
  const response = await fetch(
    apiBaseUrl +
      '/decisions/revisions/' +
      input.revisionId +
      (input.action === 'finalize' ? '/finalize' : '/draft'),
    {
      method: input.action === 'finalize' ? 'POST' : 'PUT',
      headers: {
        cookie: cookieStore.toString(),
        'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
        'content-type': 'application/json',
        ...(input.action === 'finalize' ? { 'idempotency-key': input.idempotencyKey ?? '' } : {}),
      },
      body:
        input.action === 'save' ? JSON.stringify({ responseText: input.responseText ?? '' }) : '{}',
      cache: 'no-store',
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    error?: { details?: { fields?: string[] } };
  };
  return NextResponse.json(
    response.ok ? body : { error: 'revision-failed', fields: body.error?.details?.fields ?? [] },
    { status: response.status },
  );
}
