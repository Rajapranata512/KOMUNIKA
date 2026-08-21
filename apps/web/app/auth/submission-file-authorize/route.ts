import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const input = (await request.json()) as { submissionId?: string; file?: unknown };
  const cookieStore = await cookies();
  if (!input.submissionId)
    return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
  const response = await fetch(
    `${apiBaseUrl}/submissions/${input.submissionId}/files/upload-authorizations`,
    {
      method: 'POST',
      headers: {
        cookie: cookieStore.toString(),
        'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input.file),
      cache: 'no-store',
    },
  );
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
