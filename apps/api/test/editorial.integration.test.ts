import { randomUUID } from 'node:crypto';

import { database } from '@aksara/database';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { EditorialService } from '../src/modules/editorial/editorial.service.js';
import { SubmissionService } from '../src/modules/submissions/submission.service.js';

describe('tenant-scoped editorial screening integration', () => {
  const suffix = randomUUID();
  const enqueue = vi.fn().mockResolvedValue('queued');
  const editorial = new EditorialService({ enqueue } as never);
  const submissions = new SubmissionService();
  const userIds: string[] = [];
  const journalIds: string[] = [];
  const submissionIds: string[] = [];
  let authorId = '';
  let editorInChiefId = '';
  let firstEditorId = '';
  let secondEditorId = '';
  let outsiderId = '';
  let journalId = '';
  let assignmentSubmissionId = '';
  let correctionSubmissionId = '';
  let rejectionSubmissionId = '';

  beforeAll(async () => {
    const passwordHash = await hash(`Editorial-Test-${suffix}`);
    const users = await Promise.all(
      ['author', 'chief', 'editor-one', 'editor-two', 'outsider'].map((name) =>
        database.user.create({
          data: {
            email: `editorial-${name}-${suffix}@aksara.local`,
            passwordHash,
            fullName: name,
            emailVerifiedAt: new Date(),
          },
        }),
      ),
    );
    [authorId, editorInChiefId, firstEditorId, secondEditorId, outsiderId] = users.map(
      ({ id }) => id,
    );
    userIds.push(...users.map(({ id }) => id));

    const journal = await database.journal.create({
      data: {
        slug: `editorial-${suffix}`,
        title: 'Jurnal Editorial Fiktif',
        abbreviation: 'JEF',
        description: 'Fixture screening editorial.',
        scope: 'Pengujian queue, assignment, keputusan, dan isolasi tenant.',
        contactEmail: users[1]?.email ?? 'chief@example.test',
        status: 'PUBLISHED',
        submissionsOpen: true,
        createdById: editorInChiefId,
        memberships: {
          create: [
            { userId: editorInChiefId, role: 'EDITOR_IN_CHIEF' },
            { userId: firstEditorId, role: 'SECTION_EDITOR' },
            { userId: secondEditorId, role: 'SECTION_EDITOR' },
          ],
        },
        articleTypes: { create: { slug: 'research', title: 'Artikel penelitian' } },
      },
      include: { articleTypes: true },
    });
    journalId = journal.id;
    journalIds.push(journal.id);
    const articleTypeId = journal.articleTypes[0]?.id;
    if (!articleTypeId) throw new Error('Editorial article type fixture was not created.');
    const createdSubmissions = await Promise.all(
      ['Assignment submission', 'Correction submission', 'Rejection submission'].map((title) =>
        database.submission.create({
          data: {
            journalId,
            submitterId: authorId,
            articleTypeId,
            state: 'SUBMITTED',
            title,
            abstract: 'Abstrak fiktif lengkap untuk screening editorial.',
            submittedAt: new Date(),
          },
        }),
      ),
    );
    [assignmentSubmissionId, correctionSubmissionId, rejectionSubmissionId] =
      createdSubmissions.map(({ id }) => id);
    submissionIds.push(...createdSubmissions.map(({ id }) => id));

    const foreignJournal = await database.journal.create({
      data: {
        slug: `editorial-foreign-${suffix}`,
        title: 'Jurnal Editorial Tenant Lain',
        abbreviation: 'JETL',
        description: 'Fixture tenant lain.',
        scope: 'Pengujian isolasi tenant.',
        contactEmail: users[4]?.email ?? 'outsider@example.test',
        createdById: outsiderId,
        memberships: { create: { userId: outsiderId, role: 'EDITOR_IN_CHIEF' } },
      },
    });
    journalIds.push(foreignJournal.id);
  });

  afterAll(async () => {
    await database.internalEditorialNote.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.screeningDecision.deleteMany({ where: { submissionId: { in: submissionIds } } });
    await database.screeningAssessment.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.editorialAssignment.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.submissionTimelineEvent.deleteMany({
      where: { submissionId: { in: submissionIds } },
    });
    await database.submission.deleteMany({ where: { id: { in: submissionIds } } });
    await database.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await database.journal.deleteMany({ where: { id: { in: journalIds } } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
  });

  it('exposes the journal queue only to authorized editors', async () => {
    const queue = await editorial.listQueue({ journalId }, editorInChiefId);
    expect(queue?.items).toHaveLength(3);
    await expect(editorial.listQueue({ journalId }, outsiderId)).resolves.toBeNull();
    const unassignedSectionQueue = await editorial.listQueue({ journalId }, firstEditorId);
    expect(unassignedSectionQueue?.items).toHaveLength(0);
  });

  it('records screening, assigns and overrides an editor with tenant and reason controls', async () => {
    const assessment = await editorial.recordAssessment(
      assignmentSubmissionId,
      editorInChiefId,
      {
        completenessPassed: true,
        scopePassed: true,
        policyPassed: true,
        internalNote: 'Catatan screening internal yang tidak boleh terlihat oleh author.',
      },
      `editorial-${suffix}`,
    );
    expect(typeof assessment).toBe('object');
    await expect(
      editorial.assignEditor(
        assignmentSubmissionId,
        editorInChiefId,
        { editorId: outsiderId, assignmentNote: 'Invalid cross-tenant editor.' },
        `editorial-${suffix}`,
      ),
    ).resolves.toBe('invalid-editor');
    const assigned = await editorial.assignEditor(
      assignmentSubmissionId,
      editorInChiefId,
      { editorId: firstEditorId, assignmentNote: 'Tangani screening lanjutan.' },
      `editorial-${suffix}`,
    );
    expect(typeof assigned).toBe('object');
    await expect(
      editorial.assignEditor(
        assignmentSubmissionId,
        editorInChiefId,
        { editorId: secondEditorId, assignmentNote: 'Ganti handling editor.' },
        `editorial-${suffix}`,
      ),
    ).resolves.toBe('override-reason-required');
    const overridden = await editorial.assignEditor(
      assignmentSubmissionId,
      editorInChiefId,
      {
        editorId: secondEditorId,
        assignmentNote: 'Ganti handling editor.',
        overrideReason: 'Editor pertama menyatakan tidak tersedia untuk assignment ini.',
      },
      `editorial-${suffix}`,
    );
    expect(typeof overridden).toBe('object');
    const activeAssignments = await database.editorialAssignment.findMany({
      where: { submissionId: assignmentSubmissionId, active: true },
    });
    expect(activeAssignments).toHaveLength(1);
    expect(activeAssignments[0]?.editorId).toBe(secondEditorId);
    await expect(editorial.detail(assignmentSubmissionId, firstEditorId)).resolves.toBeNull();
    await expect(editorial.detail(assignmentSubmissionId, secondEditorId)).resolves.not.toBeNull();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'editorial.assignment-created',
        submissionId: assignmentSubmissionId,
      }),
      expect.any(String),
    );
  });

  it('keeps notes internal while releasing correction and desk-reject letters to authors', async () => {
    for (const submissionId of [correctionSubmissionId, rejectionSubmissionId])
      await editorial.recordAssessment(
        submissionId,
        editorInChiefId,
        {
          completenessPassed: submissionId !== correctionSubmissionId,
          scopePassed: submissionId !== rejectionSubmissionId,
          policyPassed: true,
          internalNote: 'Internal-only screening rationale.',
        },
        `editorial-${suffix}`,
      );
    await editorial.addInternalNote(
      correctionSubmissionId,
      editorInChiefId,
      'Diskusi internal yang tidak boleh bocor ke author.',
      `editorial-${suffix}`,
    );
    const correction = await editorial.decide(
      correctionSubmissionId,
      editorInChiefId,
      {
        type: 'REQUEST_CORRECTION',
        reason: 'Metadata submission perlu dilengkapi sebelum review.',
        authorLetter: 'Mohon lengkapi metadata afiliasi dan unggah ulang naskah tanpa identitas.',
        requiredChanges: ['Lengkapi afiliasi', 'Hapus identitas dari naskah'],
      },
      `editorial-${suffix}`,
    );
    expect(typeof correction).toBe('object');
    const rejection = await editorial.decide(
      rejectionSubmissionId,
      editorInChiefId,
      {
        type: 'DESK_REJECT',
        reason: 'Topik berada di luar scope jurnal yang dinyatakan.',
        authorLetter: 'Naskah belum dapat diproses karena topiknya berada di luar scope jurnal.',
        requiredChanges: [],
      },
      `editorial-${suffix}`,
    );
    expect(typeof rejection).toBe('object');
    const authorDetail = await submissions.getForAuthor(correctionSubmissionId, authorId);
    expect(authorDetail?.state).toBe('PRE_REVIEW_CORRECTION_REQUESTED');
    expect(authorDetail?.screeningDecisions[0]).toMatchObject({
      type: 'REQUEST_CORRECTION',
      requiredChanges: ['Lengkapi afiliasi', 'Hapus identitas dari naskah'],
    });
    expect(authorDetail).not.toHaveProperty('editorialNotes');
    expect(authorDetail?.screeningDecisions[0]).not.toHaveProperty('reason');
    expect(
      await database.submission.findUnique({ where: { id: rejectionSubmissionId } }),
    ).toMatchObject({ state: 'DESK_REJECTED' });
  });
});
