import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/auth/mfa/setup`, {
    method: 'POST',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
    },
    cache: 'no-store',
  });
  if (!response.ok)
    return NextResponse.redirect(new URL('/admin/security?error=setup', request.url), 303);
  const setup = (await response.json()) as { secret: string; uri: string };
  const redirect = NextResponse.redirect(new URL('/admin/security', request.url), 303);
  redirect.cookies.set(
    'aksara_mfa_setup',
    Buffer.from(JSON.stringify(setup)).toString('base64url'),
    {
      httpOnly: true,
      secure: process.env.APP_ENV === 'production' || process.env.APP_ENV === 'staging',
      sameSite: 'strict',
      path: '/admin/security',
      maxAge: 300,
    },
  );
  return redirect;
}
