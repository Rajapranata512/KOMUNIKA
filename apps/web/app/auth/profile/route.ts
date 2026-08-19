import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

function nullable(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const cookieStore = await cookies();
  const countryCode = nullable(form.get('countryCode'));
  const response = await fetch(`${apiBaseUrl}/users/me/profile`, {
    method: 'PATCH',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fullName: String(form.get('fullName') ?? '').trim(),
      affiliation: nullable(form.get('affiliation')),
      countryCode: countryCode?.toUpperCase() ?? null,
      expertise: String(form.get('expertise') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      orcidId: nullable(form.get('orcidId')),
      locale: String(form.get('locale') ?? '').trim(),
      timezone: String(form.get('timezone') ?? '').trim(),
    }),
    cache: 'no-store',
  });
  return NextResponse.redirect(
    new URL(
      response.ok ? '/workspace/profile?saved=1' : '/workspace/profile?error=invalid',
      request.url,
    ),
    303,
  );
}
