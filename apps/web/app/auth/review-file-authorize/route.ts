import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const input = (await request.json()) as { assignmentId?: string; file?: unknown };
  const cookieStore = await cookies();
  const response = await fetch(
    `${apiBaseUrl}/reviews/assignments/${input.assignmentId ?? ''}/files/authorize`,
    {
      method: 'POST',
      headers: {
        cookie: cookieStore.toString(),
        'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input.file),
      cache: 'no-store',
    },
  );
  return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
}
