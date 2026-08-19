import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const journalId = String(form.get('journalId') ?? '');
  const cookieStore = await cookies();
  const response = await fetch(
    `${apiBaseUrl}/admin/journals/${encodeURIComponent(journalId)}/memberships`,
    {
      method: 'POST',
      headers: {
        cookie: cookieStore.toString(),
        'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: form.get('email'), role: form.get('role') }),
      cache: 'no-store',
    },
  );
  return NextResponse.redirect(
    new URL(response.ok ? '/admin/journals' : '/admin/journals?error=member', request.url),
    303,
  );
}
