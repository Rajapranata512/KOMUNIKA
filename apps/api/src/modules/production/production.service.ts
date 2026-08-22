import { Injectable } from '@nestjs/common';
import { database } from '@aksara/database';

import { TransactionalEmailQueue } from '../notifications/transactional-email.queue.js';

type MetadataInput = {
  slug: string;
  title: string;
  subtitle?: string | null;
  abstract: string;
  authors: Array<{
    givenName?: string;
    familyName?: string;
    name?: string;
    affiliation?: string;
    countryCode?: string | null;
    orcidId?: string | null;
  }>;
  keywords: string[];
  language: string;
  licenseName: string;
  licenseUrl: string;
  copyrightHolder: string;
  pages?: string | null;
  eLocator?: string | null;
  issueId?: string | null;
  articleOrder?: number;
};

type PublicSearchFilters = {
  query?: string;
  journal?: string;
  section?: string;
  articleType?: string;
  issue?: string;
  year?: number;
};

const publicVersionSelect = {
  id: true,
  version: true,
  title: true,
  subtitle: true,
  abstract: true,
  authors: true,
  keywords: true,
  language: true,
  licenseName: true,
  licenseUrl: true,
  copyrightHolder: true,
  pages: true,
  eLocator: true,
  doi: true,
  createdAt: true,
  galleys: {
    where: {
      approvedAt: { not: null },
      storedFile: { scanStatus: 'CLEAN', visibility: 'PUBLIC' },
    },
    select: { id: true, label: true, format: true, locale: true },
  },
} as const;

@Injectable()
export class ProductionService {
  constructor(private readonly emails: TransactionalEmailQueue) {}

  private async roles(journalId: string, userId: string) {
    const memberships = await database.journalMembership.findMany({
      where: { journalId, userId },
      select: { role: true },
    });
    return new Set(memberships.map(({ role }) => role));
  }

  private async canConfigure(journalId: string, userId: string) {
    const roles = await this.roles(journalId, userId);
    return ['EDITOR_IN_CHIEF', 'JOURNAL_MANAGER'].some((role) => roles.has(role as never));
  }

  private async canWorkOn(submissionId: string, journalId: string, userId: string) {
    if (await this.canConfigure(journalId, userId)) return true;
    return Boolean(
      await database.productionAssignment.findFirst({
        where: { submissionId, assigneeId: userId, active: true },
      }),
    );
  }

  private async canPublish(journalId: string, userId: string) {
    const roles = await this.roles(journalId, userId);
    return roles.has('EDITOR_IN_CHIEF');
  }

  async assign(
    submissionId: string,
    actorId: string,
    input: { assigneeId: string; stage: 'COPYEDITING' | 'PRODUCTION'; note: string },
    requestId: string,
  ) {
    const submission = await database.submission.findUnique({ where: { id: submissionId } });
    if (!submission || !(await this.canConfigure(submission.journalId, actorId))) return null;
    if (!['ACCEPTED', 'COPYEDITING', 'PRODUCTION'].includes(submission.state))
      return 'state-conflict' as const;
    const requiredRole = input.stage === 'COPYEDITING' ? 'COPYEDITOR' : 'PRODUCTION_EDITOR';
    const member = await database.journalMembership.findFirst({
      where: { journalId: submission.journalId, userId: input.assigneeId, role: requiredRole },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!member) return 'assignee-invalid' as const;
    const created = await database.$transaction(async (tx) => {
      const now = new Date();
      await tx.productionAssignment.updateMany({
        where: { submissionId, stage: input.stage, active: true },
        data: { active: false, endedAt: now },
      });
      const assignment = await tx.productionAssignment.create({
        data: {
          journalId: submission.journalId,
          submissionId,
          assigneeId: input.assigneeId,
          assignedById: actorId,
          stage: input.stage,
          note: input.note,
        },
      });
      if (input.stage === 'COPYEDITING' && submission.state === 'ACCEPTED')
        await tx.submission.update({ where: { id: submissionId }, data: { state: 'COPYEDITING' } });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.assignment_created',
          targetType: 'ProductionAssignment',
          targetId: assignment.id,
          requestId,
          metadata: {
            journalId: submission.journalId,
            submissionId,
            stage: input.stage,
            assigneeId: input.assigneeId,
          },
        },
      });
      return assignment;
    });
    await this.emails.enqueue(
      {
        event: 'production.assignment-created',
        recipient: member.user.email,
        userId: member.user.id,
        submissionId,
        requestId,
        requestedAt: new Date().toISOString(),
      },
      created.id,
    );
    return created;
  }

  async openQuery(submissionId: string, actorId: string, question: string, requestId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      select: { journalId: true, submitter: { select: { id: true, email: true } } },
    });
    if (!submission) return null;
    const assignment = await database.productionAssignment.findFirst({
      where: { submissionId, assigneeId: actorId, active: true },
    });
    if (!assignment && !(await this.canConfigure(submission.journalId, actorId))) return null;
    const created = await database.$transaction(async (tx) => {
      const query = await tx.productionQuery.create({
        data: { journalId: submission.journalId, submissionId, openedById: actorId, question },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.query_opened',
          targetType: 'ProductionQuery',
          targetId: query.id,
          requestId,
          metadata: { journalId: submission.journalId, submissionId },
        },
      });
      return query;
    });
    await this.emails.enqueue(
      {
        event: 'production.query-opened',
        recipient: submission.submitter.email,
        userId: submission.submitter.id,
        submissionId,
        requestId,
        requestedAt: new Date().toISOString(),
      },
      created.id,
    );
    return created;
  }

  async answerQuery(queryId: string, authorId: string, response: string, requestId: string) {
    const query = await database.productionQuery.findUnique({
      where: { id: queryId },
      include: { submission: { select: { submitterId: true } } },
    });
    if (!query || query.submission.submitterId !== authorId || query.status !== 'OPEN') return null;
    const now = new Date();
    return database.$transaction(async (tx) => {
      const resolved = await tx.productionQuery.update({
        where: { id: queryId },
        data: { response, respondedById: authorId, status: 'RESOLVED', resolvedAt: now },
      });
      await tx.auditEvent.create({
        data: {
          actorId: authorId,
          action: 'production.query_resolved',
          targetType: 'ProductionQuery',
          targetId: queryId,
          requestId,
          metadata: { journalId: query.journalId, submissionId: query.submissionId },
        },
      });
      return resolved;
    });
  }

  async workspace(submissionId: string, actorId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      include: {
        acceptedVersion: { select: { id: true, version: true, snapshot: true } },
        journal: { select: { id: true, title: true, slug: true } },
        productionAssignments: {
          where: { active: true },
          include: { assignee: { select: { id: true, email: true, fullName: true } } },
        },
        productionQueries: { orderBy: { createdAt: 'asc' } },
        files: {
          where: { purpose: 'COPYEDITED_SOURCE' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            storedFile: {
              select: {
                id: true,
                originalName: true,
                size: true,
                detectedMime: true,
                scanStatus: true,
                createdAt: true,
              },
            },
          },
        },
        publication: {
          include: {
            issue: {
              include: {
                coverFile: {
                  select: { id: true, originalName: true, scanStatus: true, visibility: true },
                },
              },
            },
            versions: {
              orderBy: { version: 'desc' },
              include: {
                galleys: {
                  include: {
                    storedFile: {
                      select: {
                        id: true,
                        originalName: true,
                        size: true,
                        scanStatus: true,
                        visibility: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!submission) return null;
    const roles = await this.roles(submission.journalId, actorId);
    const isAuthor = submission.submitterId === actorId;
    const isAssigned = submission.productionAssignments.some(
      ({ assigneeId }) => assigneeId === actorId,
    );
    const isManager = ['EDITOR_IN_CHIEF', 'JOURNAL_MANAGER'].some((role) =>
      roles.has(role as never),
    );
    if (!isAuthor && !isAssigned && !isManager) return null;
    const candidates = isManager
      ? await database.journalMembership.findMany({
          where: {
            journalId: submission.journalId,
            role: { in: ['COPYEDITOR', 'PRODUCTION_EDITOR'] },
          },
          include: { user: { select: { id: true, email: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const issues =
      isManager || isAssigned
        ? await database.issue.findMany({
            where: { journalId: submission.journalId, status: { in: ['DRAFT', 'SCHEDULED'] } },
            orderBy: [{ year: 'desc' }, { number: 'desc' }],
          })
        : [];
    return {
      submission: {
        id: submission.id,
        journalId: submission.journalId,
        state: submission.state,
        title: submission.title,
        journal: submission.journal,
        acceptedVersion: submission.acceptedVersion,
      },
      assignments: submission.productionAssignments,
      queries: submission.productionQueries,
      sourceFiles: submission.files,
      publication: submission.publication,
      candidates,
      issues,
      permissions: {
        isAuthor,
        canManage: isAssigned || isManager,
        canConfigure: isManager,
        canPublish: roles.has('EDITOR_IN_CHIEF'),
      },
    };
  }

  async worklist(actorId: string) {
    const memberships = await database.journalMembership.findMany({
      where: {
        userId: actorId,
        role: { in: ['COPYEDITOR', 'PRODUCTION_EDITOR', 'EDITOR_IN_CHIEF', 'JOURNAL_MANAGER'] },
      },
      select: { journalId: true, role: true },
    });
    const managed = memberships
      .filter(({ role }) => role === 'EDITOR_IN_CHIEF' || role === 'JOURNAL_MANAGER')
      .map(({ journalId }) => journalId);
    return database.submission.findMany({
      where: {
        state: { in: ['ACCEPTED', 'COPYEDITING', 'PRODUCTION', 'SCHEDULED', 'PUBLISHED'] },
        OR: [
          { journalId: { in: managed } },
          { productionAssignments: { some: { assigneeId: actorId, active: true } } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      select: {
        id: true,
        title: true,
        state: true,
        updatedAt: true,
        journal: { select: { id: true, title: true } },
        productionAssignments: {
          where: { active: true },
          select: { stage: true, assigneeId: true },
        },
        publication: {
          select: { id: true, slug: true, status: true, scheduledAt: true, publishedAt: true },
        },
      },
    });
  }

  async createIssue(
    journalId: string,
    actorId: string,
    input: {
      slug: string;
      volume: string;
      number: string;
      year: number;
      title: string;
      description: string;
    },
    requestId: string,
  ) {
    if (!(await this.canConfigure(journalId, actorId))) return null;
    return database.$transaction(async (tx) => {
      const issue = await tx.issue.create({ data: { journalId, ...input } });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.issue_created',
          targetType: 'Issue',
          targetId: issue.id,
          requestId,
          metadata: { journalId },
        },
      });
      return issue;
    });
  }

  async prepare(submissionId: string, actorId: string, input: MetadataInput, requestId: string) {
    const submission = await database.submission.findUnique({
      where: { id: submissionId },
      include: { acceptedVersion: true },
    });
    if (!submission || !(await this.canWorkOn(submissionId, submission.journalId, actorId)))
      return null;
    if (
      !submission.acceptedVersion ||
      !['ACCEPTED', 'COPYEDITING', 'PRODUCTION'].includes(submission.state)
    )
      return 'state-conflict' as const;
    const acceptedVersionId = submission.acceptedVersion.id;
    if (input.issueId) {
      const issue = await database.issue.findFirst({
        where: { id: input.issueId, journalId: submission.journalId },
      });
      if (!issue) return 'issue-invalid' as const;
    }
    return database.$transaction(async (tx) => {
      const publication = await tx.publication.upsert({
        where: { submissionId },
        create: {
          journalId: submission.journalId,
          submissionId,
          slug: input.slug,
          issueId: input.issueId,
          articleOrder: input.articleOrder ?? 0,
        },
        update: { slug: input.slug, issueId: input.issueId, articleOrder: input.articleOrder ?? 0 },
      });
      const latest = await tx.publicationVersion.findFirst({
        where: { publicationId: publication.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = await tx.publicationVersion.create({
        data: {
          journalId: submission.journalId,
          publicationId: publication.id,
          sourceVersionId: acceptedVersionId,
          createdById: actorId,
          version: (latest?.version ?? 0) + 1,
          title: input.title,
          subtitle: input.subtitle,
          abstract: input.abstract,
          authors: input.authors.map(
            ({ givenName, familyName, name, affiliation, countryCode, orcidId }) => ({
              givenName,
              familyName,
              name,
              affiliation,
              countryCode,
              orcidId,
            }),
          ) as never,
          keywords: input.keywords,
          language: input.language,
          licenseName: input.licenseName,
          licenseUrl: input.licenseUrl,
          copyrightHolder: input.copyrightHolder,
          pages: input.pages,
          eLocator: input.eLocator,
        },
      });
      if (submission.state === 'ACCEPTED')
        await tx.submission.update({ where: { id: submissionId }, data: { state: 'COPYEDITING' } });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.metadata_version_created',
          targetType: 'PublicationVersion',
          targetId: version.id,
          requestId,
          metadata: {
            journalId: submission.journalId,
            submissionId,
            publicationId: publication.id,
            version: version.version,
          },
        },
      });
      return { publication, version };
    });
  }

  async schedule(publicationId: string, actorId: string, scheduledAt: Date, requestId: string) {
    const publication = await database.publication.findUnique({
      where: { id: publicationId },
      include: {
        submission: { select: { submitter: { select: { id: true, email: true } } } },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            galleys: {
              where: {
                approvedAt: { not: null },
                storedFile: { scanStatus: 'CLEAN', visibility: 'PUBLIC' },
              },
            },
          },
        },
      },
    });
    if (!publication || !(await this.canPublish(publication.journalId, actorId))) return null;
    if (
      !publication.issueId ||
      !publication.versions[0] ||
      !publication.versions[0].galleys.length ||
      scheduledAt <= new Date()
    )
      return 'invalid' as const;
    const updated = await database.$transaction(async (tx) => {
      const updated = await tx.publication.update({
        where: { id: publicationId },
        data: { status: 'SCHEDULED', scheduledAt },
      });
      if (publication.issueId)
        await tx.issue.updateMany({
          where: { id: publication.issueId, status: 'DRAFT' },
          data: { status: 'SCHEDULED', scheduledAt },
        });
      await tx.submission.update({
        where: { id: publication.submissionId },
        data: { state: 'SCHEDULED' },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.publication_scheduled',
          targetType: 'Publication',
          targetId: publicationId,
          requestId,
          metadata: { journalId: publication.journalId, scheduledAt: scheduledAt.toISOString() },
        },
      });
      return updated;
    });
    await this.emails.enqueue(
      {
        event: 'publication.scheduled',
        recipient: publication.submission.submitter.email,
        userId: publication.submission.submitter.id,
        submissionId: publication.submissionId,
        requestId,
        requestedAt: new Date().toISOString(),
      },
      publicationId + '-' + scheduledAt.toISOString(),
    );
    return updated;
  }

  async publish(publicationId: string, actorId: string, key: string, requestId: string) {
    const publication = await database.publication.findUnique({
      where: { id: publicationId },
      include: { submission: { select: { submitter: { select: { id: true, email: true } } } } },
    });
    if (!publication || !(await this.canPublish(publication.journalId, actorId))) return null;
    if (publication.status === 'PUBLISHED')
      return publication.publicationKey === key ? publication : ('key-conflict' as const);
    if (
      publication.status !== 'SCHEDULED' ||
      !publication.scheduledAt ||
      publication.scheduledAt > new Date()
    )
      return 'state-conflict' as const;
    const updated = await database.$transaction(
      async (tx) => {
        const now = new Date();
        const updated = await tx.publication.update({
          where: { id: publicationId },
          data: { status: 'PUBLISHED', publishedAt: now, publicationKey: key },
        });
        if (publication.issueId)
          await tx.issue.updateMany({
            where: { id: publication.issueId, status: { not: 'PUBLISHED' } },
            data: { status: 'PUBLISHED', publishedAt: now },
          });
        await tx.submission.update({
          where: { id: publication.submissionId },
          data: { state: 'PUBLISHED' },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'production.publication_published',
            targetType: 'Publication',
            targetId: publicationId,
            requestId,
            metadata: { journalId: publication.journalId },
          },
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
    await this.emails.enqueue(
      {
        event: 'publication.published',
        recipient: publication.submission.submitter.email,
        userId: publication.submission.submitter.id,
        submissionId: publication.submissionId,
        requestId,
        requestedAt: new Date().toISOString(),
      },
      publicationId,
    );
    return updated;
  }

  async recordUpdate(
    publicationId: string,
    actorId: string,
    input: { type: 'CORRECTION' | 'WITHDRAWAL' | 'RETRACTION'; reason: string; notice: string },
    requestId: string,
  ) {
    const publication = await database.publication.findUnique({ where: { id: publicationId } });
    if (!publication || !(await this.canPublish(publication.journalId, actorId))) return null;
    if (!['PUBLISHED', 'WITHDRAWN', 'RETRACTED'].includes(publication.status))
      return 'state-conflict' as const;
    if (publication.status === 'RETRACTED' && input.type !== 'CORRECTION')
      return 'state-conflict' as const;
    return database.$transaction(async (tx) => {
      const update = await tx.publicationUpdate.create({
        data: { journalId: publication.journalId, publicationId, createdById: actorId, ...input },
      });
      if (input.type !== 'CORRECTION') {
        const status = input.type === 'RETRACTION' ? 'RETRACTED' : 'WITHDRAWN';
        await tx.publication.update({ where: { id: publicationId }, data: { status } });
        await tx.submission.update({
          where: { id: publication.submissionId },
          data: { state: input.type === 'RETRACTION' ? 'RETRACTED' : 'WITHDRAWN' },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'production.publication_update_recorded',
          targetType: 'PublicationUpdate',
          targetId: update.id,
          requestId,
          metadata: { journalId: publication.journalId, publicationId, type: input.type },
        },
      });
      return update;
    });
  }

  listPublic(filters: PublicSearchFilters = {}) {
    const query = filters.query ?? '';
    const queryYear = /^\d{4}$/.test(query) ? Number(query) : undefined;
    return database.publication.findMany({
      where: {
        status: { in: ['PUBLISHED', 'WITHDRAWN', 'RETRACTED'] },
        ...(filters.journal ? { journal: { slug: filters.journal } } : {}),
        ...(filters.issue || filters.year
          ? {
              issue: {
                ...(filters.issue ? { slug: filters.issue } : {}),
                ...(filters.year ? { year: filters.year } : {}),
              },
            }
          : {}),
        ...(filters.section || filters.articleType
          ? {
              submission: {
                articleType: {
                  ...(filters.articleType ? { slug: filters.articleType } : {}),
                  ...(filters.section ? { section: { slug: filters.section } } : {}),
                },
              },
            }
          : {}),
        ...(query
          ? {
              OR: [
                {
                  versions: {
                    some: {
                      OR: [
                        { title: { contains: query, mode: 'insensitive' } },
                        { abstract: { contains: query, mode: 'insensitive' } },
                        { keywords: { has: query } },
                        { doi: { contains: query, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
                {
                  submission: {
                    authors: {
                      some: {
                        OR: [
                          { givenName: { contains: query, mode: 'insensitive' } },
                          { familyName: { contains: query, mode: 'insensitive' } },
                          { affiliation: { contains: query, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
                ...(queryYear ? [{ issue: { year: queryYear } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        status: true,
        publishedAt: true,
        journal: { select: { slug: true, title: true } },
        issue: { select: { slug: true, title: true, volume: true, number: true, year: true } },
        versions: { orderBy: { version: 'desc' }, take: 1, select: publicVersionSelect },
      },
    });
  }

  async publicSearchFacets() {
    const publicStatuses: Array<'PUBLISHED' | 'WITHDRAWN' | 'RETRACTED'> = [
      'PUBLISHED',
      'WITHDRAWN',
      'RETRACTED',
    ];
    const [journals, sections, articleTypes, issues] = await Promise.all([
      database.journal.findMany({
        where: { status: 'PUBLISHED', publications: { some: { status: { in: publicStatuses } } } },
        orderBy: { title: 'asc' },
        select: { slug: true, title: true },
      }),
      database.journalSection.findMany({
        where: {
          articleTypes: {
            some: { submissions: { some: { publication: { status: { in: publicStatuses } } } } },
          },
        },
        orderBy: [{ journal: { title: 'asc' } }, { title: 'asc' }],
        select: { slug: true, title: true, journal: { select: { slug: true, title: true } } },
      }),
      database.articleType.findMany({
        where: { submissions: { some: { publication: { status: { in: publicStatuses } } } } },
        orderBy: [{ journal: { title: 'asc' } }, { title: 'asc' }],
        select: { slug: true, title: true, journal: { select: { slug: true, title: true } } },
      }),
      database.issue.findMany({
        where: { publications: { some: { status: { in: publicStatuses } } } },
        orderBy: [{ year: 'desc' }, { journal: { title: 'asc' } }, { number: 'desc' }],
        select: {
          slug: true,
          title: true,
          volume: true,
          number: true,
          year: true,
          journal: { select: { slug: true, title: true } },
        },
      }),
    ]);
    return { journals, sections, articleTypes, issues };
  }

  publicIssues(journalSlug: string) {
    return database.issue.findMany({
      where: {
        journal: { slug: journalSlug, status: 'PUBLISHED' },
        status: 'PUBLISHED',
        publications: { some: { status: { in: ['PUBLISHED', 'WITHDRAWN', 'RETRACTED'] } } },
      },
      orderBy: [{ year: 'desc' }, { publishedAt: 'desc' }],
      include: {
        journal: { select: { slug: true, title: true } },
        _count: {
          select: {
            publications: { where: { status: { in: ['PUBLISHED', 'WITHDRAWN', 'RETRACTED'] } } },
          },
        },
      },
    });
  }

  async publicIssue(journalSlug: string, issueSlug: string) {
    const issue = await database.issue.findFirst({
      where: {
        slug: issueSlug,
        status: 'PUBLISHED',
        journal: { slug: journalSlug, status: 'PUBLISHED' },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        volume: true,
        number: true,
        year: true,
        description: true,
        publishedAt: true,
        coverFile: { select: { visibility: true, scanStatus: true } },
        journal: { select: { slug: true, title: true, abbreviation: true } },
        publications: {
          where: { status: { in: ['PUBLISHED', 'WITHDRAWN', 'RETRACTED'] } },
          orderBy: { articleOrder: 'asc' },
          select: {
            id: true,
            slug: true,
            status: true,
            publishedAt: true,
            versions: { orderBy: { version: 'desc' }, take: 1, select: publicVersionSelect },
          },
        },
      },
    });
    if (!issue) return null;
    const { coverFile, ...record } = issue;
    return {
      ...record,
      hasCover: coverFile?.visibility === 'PUBLIC' && coverFile.scanStatus === 'CLEAN',
    };
  }

  publicArticle(journalSlug: string, articleSlug: string) {
    return database.publication.findFirst({
      where: {
        slug: articleSlug,
        status: { in: ['PUBLISHED', 'WITHDRAWN', 'RETRACTED'] },
        journal: { slug: journalSlug, status: 'PUBLISHED' },
      },
      select: {
        id: true,
        slug: true,
        status: true,
        publishedAt: true,
        journal: {
          select: {
            slug: true,
            title: true,
            abbreviation: true,
            printIssn: true,
            electronicIssn: true,
            primaryLanguage: true,
            contactEmail: true,
          },
        },
        issue: {
          select: {
            slug: true,
            title: true,
            volume: true,
            number: true,
            year: true,
            publishedAt: true,
          },
        },
        versions: { orderBy: { version: 'desc' }, take: 1, select: publicVersionSelect },
        updates: {
          orderBy: { effectiveAt: 'asc' },
          select: { id: true, type: true, notice: true, effectiveAt: true },
        },
      },
    });
  }
}
