import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
export async function GET(request: NextRequest) {
  const submissionId = request.nextUrl.searchParams.get('submissionId');
  const fileId = request.nextUrl.searchParams.get('fileId');
  if (!submissionId || !fileId)
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  const jar = await cookies();
  const response = await fetch(
    apiBaseUrl +
      '/production/submissions/' +
      encodeURIComponent(submissionId) +
      '/files/' +
      encodeURIComponent(fileId),
    { headers: { cookie: jar.toString() }, redirect: 'manual', cache: 'no-store' },
  );
  const location = response.headers.get('location');
  if (!location)
    return NextResponse.json({ error: 'file unavailable' }, { status: response.status });
  return NextResponse.redirect(location, 302);
}
