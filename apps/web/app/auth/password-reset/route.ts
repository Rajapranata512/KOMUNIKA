import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = form.get('token');
  const payload = token ? { token, password: form.get('password') } : { email: form.get('email') };
  const response = await fetch(`${apiBaseUrl}/auth/password-resets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!response.ok) {
    const suffix = token ? `&token=${encodeURIComponent(String(token))}` : '';
    return NextResponse.redirect(
      new URL(`/forgot-password?error=invalid${suffix}`, request.url),
      303,
    );
  }
  const result = (await response.json()) as { developmentToken?: string; success?: boolean };
  if (result.success) return NextResponse.redirect(new URL('/login?reset=1', request.url), 303);
  if (result.developmentToken)
    return NextResponse.redirect(
      new URL(`/forgot-password?token=${encodeURIComponent(result.developmentToken)}`, request.url),
      303,
    );
  return NextResponse.redirect(new URL('/forgot-password', request.url), 303);
}
