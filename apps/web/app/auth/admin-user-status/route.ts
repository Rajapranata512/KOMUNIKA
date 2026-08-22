import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const userId = String(form.get('userId') ?? '');
  const disabled = String(form.get('disabled') ?? '');
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get('aksara_csrf')?.value ?? '';
  const response = await fetch(
    `${apiBaseUrl}/admin/users/${encodeURIComponent(userId)}/status?disabled=${encodeURIComponent(disabled)}`,
    {
      method: 'PATCH',
      headers: { cookie: cookieStore.toString(), 'x-csrf-token': csrfToken },
      cache: 'no-store',
    },
  );
  const destination = response.ok ? '/admin/users?updated=1' : '/admin/users?error=1';
  return NextResponse.redirect(new URL(destination, request.url), 303);
}
