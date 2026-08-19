import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get('token') ?? '');
  const response = await fetch(`${apiBaseUrl}/auth/email-verifications`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
  });
  if (!response.ok)
    return NextResponse.redirect(
      new URL(`/verify-email?error=invalid&token=${encodeURIComponent(token)}`, request.url),
      303,
    );
  return NextResponse.redirect(new URL('/login?verified=1', request.url), 303);
}
