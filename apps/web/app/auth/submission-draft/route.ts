import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const input = (await request.json()) as { submissionId?: string; draft?: unknown };
  const cookieStore = await cookies();
  if (!input.submissionId)
    return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
  const response = await fetch(`${apiBaseUrl}/submissions/${input.submissionId}/draft`, {
    method: 'PATCH',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input.draft),
    cache: 'no-store',
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
