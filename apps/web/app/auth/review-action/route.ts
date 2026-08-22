import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const cookieStore = await cookies();
  const headers = {
    cookie: cookieStore.toString(),
    'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
    'content-type': 'application/json',
  };
  if (action === 'invitation-response') {
    const invitationId = String(form.get('invitationId') ?? '');
    const token = String(form.get('token') ?? '');
    const responseValue = String(form.get('response') ?? '');
    const response = await fetch(`${apiBaseUrl}/reviews/invitations/${invitationId}/respond`, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify({
        token,
        response: responseValue,
        conflictDeclared: form.get('conflictDeclared') === 'on',
        conflictNote: String(form.get('conflictNote') ?? ''),
      }),
    });
    if (response.ok) {
      const body = (await response.json()) as { assignmentId: string | null };
      return NextResponse.redirect(
        new URL(
          body.assignmentId
            ? `/reviewer/assignments/${body.assignmentId}`
            : '/reviewer?responded=declined',
          request.url,
        ),
        303,
      );
    }
    return NextResponse.redirect(
      new URL(
        `/reviewer/invitations/${invitationId}?token=${encodeURIComponent(token)}&error=response`,
        request.url,
      ),
      303,
    );
  }
  if (action === 'review-draft' || action === 'review-submit') {
    const assignmentId = String(form.get('assignmentId') ?? '');
    const answers = [...form.entries()]
      .filter(([name]) => name.startsWith('answer:'))
      .map(([name, value]) => ({ questionId: name.slice('answer:'.length), value: String(value) }));
    const response = await fetch(
      `${apiBaseUrl}/reviews/assignments/${assignmentId}/${action === 'review-submit' ? 'submit' : 'draft'}`,
      {
        method: action === 'review-submit' ? 'POST' : 'PUT',
        headers,
        cache: 'no-store',
        body: JSON.stringify({
          commentsToAuthor: String(form.get('commentsToAuthor') ?? ''),
          confidentialComments: String(form.get('confidentialComments') ?? ''),
          recommendation: String(form.get('recommendation') ?? '') || undefined,
          answers,
        }),
      },
    );
    return NextResponse.redirect(
      new URL(
        `/reviewer/assignments/${assignmentId}?result=${response.ok ? action : 'error'}`,
        request.url,
      ),
      303,
    );
  }
  return NextResponse.redirect(new URL('/reviewer?error=invalid', request.url), 303);
}
