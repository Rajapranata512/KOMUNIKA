import { describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../identity/auth.service.js';
import type { RequestWithContext } from '../identity/identity.types.js';
import { JournalSubmissionController } from './submission.controller.js';
import type { SubmissionService } from './submission.service.js';

describe('JournalSubmissionController', () => {
  it('allows an authenticated unverified author to create a draft', async () => {
    const createDraft = vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      state: 'DRAFT',
    });
    const submissions = { createDraft } as unknown as SubmissionService;
    const auth = {
      authenticateUser: vi.fn().mockResolvedValue({
        sessionId: 'session-id',
        user: {
          id: '33333333-3333-4333-8333-333333333333',
          email: 'author-preview@example.invalid',
          platformRole: null,
          emailVerified: false,
        },
      }),
    } as unknown as AuthService;
    const request = {
      headers: {
        cookie: 'aksara_session=session-token; aksara_csrf=csrf-token',
      },
      requestId: 'request-id',
    } as RequestWithContext;
    const controller = new JournalSubmissionController(submissions, auth);

    await expect(
      controller.create(
        '44444444-4444-4444-8444-444444444444',
        { articleTypeId: '55555555-5555-4555-8555-555555555555' },
        'csrf-token',
        request,
      ),
    ).resolves.toMatchObject({ state: 'DRAFT' });
    expect(createDraft).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      '33333333-3333-4333-8333-333333333333',
      'request-id',
    );
  });
});
