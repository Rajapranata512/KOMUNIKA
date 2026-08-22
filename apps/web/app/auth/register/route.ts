import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const response = await fetch(`${apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    cache: 'no-store',
  });
  if (!response.ok)
    return NextResponse.redirect(new URL('/register?error=invalid', request.url), 303);
  await response.json();
  const destination = '/login?registered=1';
  return NextResponse.redirect(new URL(destination, request.url), 303);
}
