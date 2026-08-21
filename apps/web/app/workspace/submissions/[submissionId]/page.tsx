import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { SubmissionEditor } from './submission-editor';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const cookieStore = await cookies();
  const response = await fetch(`${apiBaseUrl}/submissions/${submissionId}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Submission could not be loaded.');
  return <SubmissionEditor initial={await response.json()} />;
}
