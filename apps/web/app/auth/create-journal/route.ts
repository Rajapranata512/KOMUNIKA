import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/admin/journals`, {
    method: 'POST',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      slug: form.get('slug'),
      title: form.get('title'),
      abbreviation: form.get('abbreviation'),
      description: form.get('description'),
      scope: form.get('scope'),
      contactEmail: form.get('contactEmail'),
      primaryLanguage: form.get('primaryLanguage'),
      reviewModel: form.get('reviewModel'),
      status: form.get('status'),
      submissionsOpen: form.get('submissionsOpen') === 'true',
    }),
    cache: 'no-store',
  });
  return NextResponse.redirect(
    new URL(response.ok ? '/admin/journals' : '/admin/journals?error=create', request.url),
    303,
  );
}
