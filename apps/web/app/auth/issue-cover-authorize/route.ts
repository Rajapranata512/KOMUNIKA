import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const input = (await request.json()) as { issueId?: string; file?: unknown };
  if (!input.issueId) return NextResponse.json({ error: 'issueId required' }, { status: 400 });
  const jar = await cookies();
  const response = await fetch(
    apiBaseUrl + '/production/issues/' + input.issueId + '/cover/upload-authorizations',
    {
      method: 'POST',
      headers: {
        cookie: jar.toString(),
        'x-csrf-token': jar.get('aksara_csrf')?.value ?? '',
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
