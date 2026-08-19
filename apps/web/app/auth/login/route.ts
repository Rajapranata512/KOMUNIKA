import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: appBaseUrl },
    body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    cache: 'no-store',
  });
  if (!response.ok) return NextResponse.redirect(new URL('/login?error=invalid', request.url), 303);
  const result = (await response.json()) as {
    user: { platformRole: 'PLATFORM_ADMIN' | null };
  };
  const destination =
    result.user.platformRole === 'PLATFORM_ADMIN' ? '/admin' : '/workspace/profile';
  const redirect = NextResponse.redirect(new URL(destination, request.url), 303);
  for (const cookie of response.headers.getSetCookie())
    redirect.headers.append('set-cookie', cookie);
  return redirect;
}
