import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function GET(request: NextRequest) {
  const assignmentId = request.nextUrl.searchParams.get('assignmentId') ?? '';
  const fileId = request.nextUrl.searchParams.get('fileId') ?? '';
  const cookieStore = await cookies();
  const response = await fetch(
    `${apiBaseUrl}/reviews/assignments/${assignmentId}/files/${fileId}`,
    {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    },
  );
  if (!response.ok)
    return NextResponse.redirect(
      new URL(`/reviewer/assignments/${assignmentId}?result=download-error`, request.url),
      303,
    );
  const body = (await response.json()) as { url: string };
  return NextResponse.redirect(body.url, 303);
}
