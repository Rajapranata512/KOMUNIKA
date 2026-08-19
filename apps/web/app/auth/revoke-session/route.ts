import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const sessionId = String(form.get('sessionId') ?? '');
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get('aksara_csrf')?.value ?? '';
  const response = await fetch(`${apiBaseUrl}/admin/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { cookie: cookieStore.toString(), 'x-csrf-token': csrfToken },
    cache: 'no-store',
  });
  if (!response.ok)
    return NextResponse.redirect(new URL('/admin?sessionError=1', request.url), 303);
  return NextResponse.redirect(new URL('/admin', request.url), 303);
}
