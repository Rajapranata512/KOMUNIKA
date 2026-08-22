import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const cookieStore = await cookies();
  const submissionId = String(form.get('submissionId') ?? '');
  const action = String(form.get('action') ?? '');
  const path = {
    assess: 'screening-checks',
    assign: 'editorial-assignments',
    decide: 'screening-decisions',
    note: 'editorial-notes',
    'invite-reviewer': 'review-invitation',
    'review-reminder': 'review-reminder',
  }[action];
  if (!path || !submissionId)
    return NextResponse.redirect(new URL('/editorial?error=invalid', request.url), 303);
  const responseDeadline =
    action === 'invite-reviewer' ? new Date(String(form.get('responseDeadline') ?? '')) : null;
  const reviewDeadline =
    action === 'invite-reviewer' ? new Date(String(form.get('reviewDeadline') ?? '')) : null;
  if (
    action === 'invite-reviewer' &&
    (!responseDeadline ||
      !reviewDeadline ||
      Number.isNaN(responseDeadline.getTime()) ||
      Number.isNaN(reviewDeadline.getTime()))
  )
    return NextResponse.redirect(
      new URL(`/editorial/submissions/${submissionId}?result=error`, request.url),
      303,
    );
  const body =
    action === 'assess'
      ? {
          completenessPassed: form.get('completenessPassed') === 'on',
          scopePassed: form.get('scopePassed') === 'on',
          policyPassed: form.get('policyPassed') === 'on',
          internalNote: String(form.get('internalNote') ?? ''),
        }
      : action === 'assign'
        ? {
            editorId: String(form.get('editorId') ?? ''),
            assignmentNote: String(form.get('assignmentNote') ?? ''),
            ...(form.get('overrideReason')
              ? { overrideReason: String(form.get('overrideReason')) }
              : {}),
          }
        : action === 'decide'
          ? {
              type: String(form.get('decisionType') ?? ''),
              reason: String(form.get('reason') ?? ''),
              authorLetter: String(form.get('authorLetter') ?? ''),
              requiredChanges: String(form.get('requiredChanges') ?? '')
                .split('\n')
                .map((item) => item.trim())
                .filter(Boolean),
            }
          : action === 'invite-reviewer'
            ? {
                reviewerId: String(form.get('reviewerId') ?? ''),
                reviewFormId: String(form.get('reviewFormId') ?? ''),
                responseDeadline: responseDeadline?.toISOString(),
                reviewDeadline: reviewDeadline?.toISOString(),
              }
            : { body: String(form.get('body') ?? '') };
  const endpoint =
    action === 'invite-reviewer'
      ? `/reviews/submissions/${submissionId}/invitations`
      : action === 'review-reminder'
        ? `/reviews/invitations/${String(form.get('invitationId') ?? '')}/reminders`
        : `/submissions/${submissionId}/${path}`;
  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('aksara_csrf')?.value ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const result = response.ok ? action : 'error';
  return NextResponse.redirect(
    new URL(`/editorial/submissions/${submissionId}?result=${result}`, request.url),
    303,
  );
}
