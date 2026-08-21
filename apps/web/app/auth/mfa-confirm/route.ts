import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/auth/mfa/setup/confirm`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
    },
    body: JSON.stringify({ code: form.get('code') }),
    cache: 'no-store',
  });
  const redirect = NextResponse.redirect(
    new URL(response.ok ? '/admin/security?enabled=1' : '/admin/security?error=code', request.url),
    303,
  );
  if (response.ok)
    redirect.cookies.set('aksara_mfa_setup', '', { path: '/admin/security', maxAge: 0 });
  return redirect;
}
