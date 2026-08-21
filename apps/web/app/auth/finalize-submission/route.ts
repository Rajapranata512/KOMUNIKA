import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const input = (await request.json()) as { submissionId?: string; idempotencyKey?: string };
  const cookieStore = await cookies();
  if (!input.submissionId || !input.idempotencyKey)
    return NextResponse.json({ error: 'finalization identifiers required' }, { status: 400 });
  const response = await fetch(`${apiBaseUrl}/submissions/${input.submissionId}/finalize`, {
    method: 'POST',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
      'idempotency-key': input.idempotencyKey,
    },
    cache: 'no-store',
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
