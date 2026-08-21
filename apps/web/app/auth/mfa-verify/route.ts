import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const cookieStore = await cookies();
  const challengeToken = cookieStore.get('aksara_mfa_challenge')?.value ?? '';
  const response = await fetch(`${apiBaseUrl}/auth/mfa/challenges/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeToken, code: form.get('code') }),
    cache: 'no-store',
  });
  if (!response.ok) return NextResponse.redirect(new URL('/login/mfa?error=1', request.url), 303);
  const redirect = NextResponse.redirect(new URL('/admin', request.url), 303);
  redirect.cookies.set('aksara_mfa_challenge', '', { path: '/', maxAge: 0 });
  for (const cookie of response.headers.getSetCookie())
    redirect.headers.append('set-cookie', cookie);
  return redirect;
}
