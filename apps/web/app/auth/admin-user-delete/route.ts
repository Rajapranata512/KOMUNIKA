import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const userId = String(form.get('userId') ?? '');
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get('aksara_csrf')?.value ?? '';
  const response = await fetch(`${apiBaseUrl}/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { cookie: cookieStore.toString(), 'x-csrf-token': csrfToken },
    cache: 'no-store',
  });

  if (response.ok)
    return NextResponse.redirect(new URL('/admin/users?deleted=1', request.url), 303);

  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  const error =
    body?.error?.code === 'USER_DELETE_BLOCKED_BY_RECORDS' ? 'delete-blocked' : 'delete';
  return NextResponse.redirect(new URL(`/admin/users?error=${error}`, request.url), 303);
}
