import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const csrf = request.cookies.get('aksara_csrf')?.value;
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: 'POST',
    headers: {
      cookie: request.headers.get('cookie') ?? '',
      origin: appBaseUrl,
      'x-csrf-token': csrf ?? '',
    },
    cache: 'no-store',
  });
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.delete('aksara_session');
  response.cookies.delete('aksara_csrf');
  return response;
}
