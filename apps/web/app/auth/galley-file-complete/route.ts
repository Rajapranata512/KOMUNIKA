import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
export async function POST(request: NextRequest) {
  const input = (await request.json()) as { versionId?: string; fileId?: string };
  if (!input.versionId || !input.fileId)
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  const jar = await cookies();
  const response = await fetch(
    apiBaseUrl +
      '/production/versions/' +
      input.versionId +
      '/galleys/' +
      input.fileId +
      '/complete',
    {
      method: 'POST',
      headers: { cookie: jar.toString(), 'x-csrf-token': jar.get('aksara_csrf')?.value ?? '' },
      cache: 'no-store',
    },
  );
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
