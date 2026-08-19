import { Injectable } from '@nestjs/common';
import { database, Prisma } from '@aksara/database';
import { hasJournalPermission, type JournalRole, type JournalTemplateKind } from '@aksara/domain';

interface JournalInput {
  slug: string;
  title: string;
  abbreviation: string;
  description: string;
  scope: string;
  contactEmail: string;
  printIssn?: string | null;
  electronicIssn?: string | null;
  primaryLanguage: string;
  reviewModel: 'SINGLE_ANONYMOUS' | 'DOUBLE_ANONYMOUS';
  status: 'DRAFT' | 'PUBLISHED';
  submissionsOpen: boolean;
}

interface SectionInput {
  slug: string;
  title: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface ArticleTypeInput {
  slug: string;
  title: string;
  description?: string;
  sectionId?: string | null;
  peerReviewRequired?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

interface ChecklistInput {
  label: string;
  isRequired?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

interface DeclarationInput {
  code: string;
  title: string;
  body: string;
  isRequired?: boolean;
  isActive?: boolean;
}

interface DeclarationUpdateInput {
  title?: string;
  body?: string;
  isRequired?: boolean;
  isActive?: boolean;
}

interface TemplateInput {
  kind: JournalTemplateKind;
  slug: string;
  title: string;
  body: string;
  sortOrder?: number;
  isActive?: boolean;
}

const publicJournalSelect = {
  id: true,
  slug: true,
  title: true,
  abbreviation: true,
  description: true,
  scope: true,
  contactEmail: true,
  printIssn: true,
  electronicIssn: true,
  primaryLanguage: true,
  reviewModel: true,
  submissionsOpen: true,
} as const;

const managedConfigInclude = {
  memberships: {
    select: { id: true, role: true, createdAt: true, user: { select: { id: true, email: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  sections: { orderBy: [{ sortOrder: 'asc' as const }, { title: 'asc' as const }] },
  articleTypes: { orderBy: [{ sortOrder: 'asc' as const }, { title: 'asc' as const }] },
  checklistItems: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  declarations: { orderBy: [{ code: 'asc' as const }, { version: 'desc' as const }] },
  templates: { orderBy: [{ sortOrder: 'asc' as const }, { title: 'asc' as const }] },
};

const publicConfigInclude = {
  sections: {
    where: { isActive: true },
    select: { slug: true, title: true, description: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' as const }, { title: 'asc' as const }],
  },
  articleTypes: {
    where: { isActive: true },
    select: {
      slug: true,
      title: true,
      description: true,
      peerReviewRequired: true,
      sortOrder: true,
      section: { select: { slug: true, title: true } },
    },
    orderBy: [{ sortOrder: 'asc' as const }, { title: 'asc' as const }],
  },
  checklistItems: {
    where: { isActive: true },
    select: { label: true, isRequired: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  declarations: {
    where: { isActive: true },
    select: { code: true, version: true, title: true, body: true, isRequired: true },
    orderBy: [{ code: 'asc' as const }, { version: 'desc' as const }],
  },
  templates: {
    where: { isActive: true },
    select: { kind: true, slug: true, title: true, body: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' as const }, { title: 'asc' as const }],
  },
};

@Injectable()
export class JournalService {
  listPublic() {
    return database.journal.findMany({
      where: { status: 'PUBLISHED' },
      select: publicJournalSelect,
      orderBy: { title: 'asc' },
    });
  }

  getPublic(slug: string) {
    return database.journal.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        ...publicJournalSelect,
        ...publicConfigInclude,
      },
    });
  }

  async listForUser(userId: string, platformRole: 'PLATFORM_ADMIN' | null) {
    return database.journal.findMany({
      where:
        platformRole === 'PLATFORM_ADMIN'
          ? {}
          : { memberships: { some: { userId, role: 'JOURNAL_MANAGER' } } },
      include: {
        _count: { select: { memberships: true } },
        memberships: {
          where: { userId },
          select: { role: true },
        },
      },
      orderBy: { title: 'asc' },
    });
  }

  loadConfiguration(journalId: string) {
    return database.journal.findUnique({
      where: { id: journalId },
      include: managedConfigInclude,
    });
  }

  async create(input: JournalInput, actorId: string, requestId: string) {
    return database.$transaction(async (transaction) => {
      const journal = await transaction.journal.create({
        data: { ...input, createdById: actorId },
      });
      await transaction.journalMembership.create({
        data: { journalId: journal.id, userId: actorId, role: 'JOURNAL_MANAGER' },
      });
      await transaction.auditEvent.create({
        data: {
          actorId,
          action: 'journal.created',
          targetType: 'Journal',
          targetId: journal.id,
          requestId,
          metadata: { slug: journal.slug, status: journal.status },
        },
      });
      return journal;
    });
  }

  async canManage(
    journalId: string,
    userId: string,
    platformRole: 'PLATFORM_ADMIN' | null,
    permission: 'journal.settings.manage' | 'journal.memberships.manage',
  ) {
    const memberships = await database.journalMembership.findMany({
      where: { journalId, userId },
      select: { role: true },
    });
    return hasJournalPermission(
      {
        platformRole,
        journalRoles: memberships.map(({ role }) => role),
      },
      permission,
    );
  }

  async update(
    journalId: string,
    input: Partial<JournalInput>,
    actorId: string,
    requestId: string,
  ) {
    return database.$transaction(async (transaction) => {
      const journal = await transaction.journal.update({
        where: { id: journalId },
        data: input,
      });
      await transaction.auditEvent.create({
        data: {
          actorId,
          action: 'journal.updated',
          targetType: 'Journal',
          targetId: journal.id,
          requestId,
          metadata: { fields: Object.keys(input) },
        },
      });
      return journal;
    });
  }

  async addMembership(
    journalId: string,
    emailInput: string,
    role: JournalRole,
    actorId: string,
    requestId: string,
  ) {
    const email = emailInput.trim().toLowerCase();
    const user = await database.user.findUnique({ where: { email } });
    if (!user || user.disabledAt || !user.emailVerifiedAt) return null;
    const membership = await database.$transaction(async (transaction) => {
      const created = await transaction.journalMembership.upsert({
        where: { journalId_userId_role: { journalId, userId: user.id, role } },
        create: { journalId, userId: user.id, role },
        update: {},
      });
      await transaction.auditEvent.create({
        data: {
          actorId,
          action: 'journal.membership_granted',
          targetType: 'Journal',
          targetId: journalId,
          requestId,
          metadata: { subjectUserId: user.id, role },
        },
      });
      return created;
    });
    return { membership, user: { id: user.id, email: user.email } };
  }

  async createSection(journalId: string, input: SectionInput, actorId: string, requestId: string) {
    if (await this.hasSectionSlug(journalId, input.slug)) return 'conflict' as const;
    return database.$transaction(async (transaction) => {
      const section = await transaction.journalSection.create({
        data: {
          journalId,
          slug: input.slug,
          title: input.title,
          description: input.description ?? '',
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.section_created',
        {
          sectionId: section.id,
          slug: section.slug,
        },
      );
      return section;
    });
  }

  async updateSection(
    journalId: string,
    sectionId: string,
    input: Partial<SectionInput>,
    actorId: string,
    requestId: string,
  ) {
    const section = await database.journalSection.findFirst({
      where: { id: sectionId, journalId },
    });
    if (!section) return null;
    if (
      input.slug &&
      input.slug !== section.slug &&
      (await this.hasSectionSlug(journalId, input.slug))
    ) {
      return 'conflict' as const;
    }
    return database.$transaction(async (transaction) => {
      const updated = await transaction.journalSection.update({
        where: { id: sectionId },
        data: input,
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.section_updated',
        {
          sectionId,
          fields: Object.keys(input),
        },
      );
      return updated;
    });
  }

  async createArticleType(
    journalId: string,
    input: ArticleTypeInput,
    actorId: string,
    requestId: string,
  ) {
    if (await this.hasArticleTypeSlug(journalId, input.slug)) return 'conflict' as const;
    const sectionId = await this.resolveSectionId(journalId, input.sectionId);
    if (sectionId === 'invalid') return 'invalid-section' as const;
    return database.$transaction(async (transaction) => {
      const articleType = await transaction.articleType.create({
        data: {
          journalId,
          sectionId,
          slug: input.slug,
          title: input.title,
          description: input.description ?? '',
          peerReviewRequired: input.peerReviewRequired ?? true,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.article_type_created',
        { articleTypeId: articleType.id, slug: articleType.slug },
      );
      return articleType;
    });
  }

  async updateArticleType(
    journalId: string,
    articleTypeId: string,
    input: Partial<ArticleTypeInput>,
    actorId: string,
    requestId: string,
  ) {
    const articleType = await database.articleType.findFirst({
      where: { id: articleTypeId, journalId },
    });
    if (!articleType) return null;
    if (
      input.slug &&
      input.slug !== articleType.slug &&
      (await this.hasArticleTypeSlug(journalId, input.slug))
    ) {
      return 'conflict' as const;
    }
    let sectionId = articleType.sectionId;
    if (input.sectionId !== undefined) {
      const resolved = await this.resolveSectionId(journalId, input.sectionId);
      if (resolved === 'invalid') return 'invalid-section' as const;
      sectionId = resolved;
    }
    return database.$transaction(async (transaction) => {
      const updated = await transaction.articleType.update({
        where: { id: articleTypeId },
        data: { ...input, sectionId },
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.article_type_updated',
        { articleTypeId, fields: Object.keys(input) },
      );
      return updated;
    });
  }

  async createChecklistItem(
    journalId: string,
    input: ChecklistInput,
    actorId: string,
    requestId: string,
  ) {
    return database.$transaction(async (transaction) => {
      const item = await transaction.submissionChecklistItem.create({
        data: {
          journalId,
          label: input.label,
          isRequired: input.isRequired ?? true,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.checklist_item_created',
        { checklistItemId: item.id },
      );
      return item;
    });
  }

  async updateChecklistItem(
    journalId: string,
    itemId: string,
    input: Partial<ChecklistInput>,
    actorId: string,
    requestId: string,
  ) {
    const item = await database.submissionChecklistItem.findFirst({
      where: { id: itemId, journalId },
    });
    if (!item) return null;
    return database.$transaction(async (transaction) => {
      const updated = await transaction.submissionChecklistItem.update({
        where: { id: itemId },
        data: input,
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.checklist_item_updated',
        { checklistItemId: itemId, fields: Object.keys(input) },
      );
      return updated;
    });
  }

  async createDeclaration(
    journalId: string,
    input: DeclarationInput,
    actorId: string,
    requestId: string,
  ) {
    const existing = await database.journalDeclaration.findFirst({
      where: { journalId, code: input.code },
    });
    if (existing) return 'conflict' as const;
    return database.$transaction(async (transaction) => {
      const declaration = await transaction.journalDeclaration.create({
        data: {
          journalId,
          code: input.code,
          version: 1,
          title: input.title,
          body: input.body,
          isRequired: input.isRequired ?? true,
          isActive: input.isActive ?? true,
        },
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.declaration_created',
        { declarationId: declaration.id, code: declaration.code, version: 1 },
      );
      return declaration;
    });
  }

  async updateDeclaration(
    journalId: string,
    declarationId: string,
    input: DeclarationUpdateInput,
    actorId: string,
    requestId: string,
  ) {
    const current = await database.journalDeclaration.findFirst({
      where: { id: declarationId, journalId },
    });
    if (!current) return null;
    const nextTitle = input.title ?? current.title;
    const nextBody = input.body ?? current.body;
    const textChanged = nextTitle !== current.title || nextBody !== current.body;
    return database.$transaction(async (transaction) => {
      if (!textChanged) {
        const updated = await transaction.journalDeclaration.update({
          where: { id: declarationId },
          data: {
            isRequired: input.isRequired ?? current.isRequired,
            isActive: input.isActive ?? current.isActive,
          },
        });
        await this.recordAudit(
          transaction,
          actorId,
          requestId,
          journalId,
          'journal.declaration_updated',
          { declarationId, code: current.code, version: current.version },
        );
        return updated;
      }
      const latest = await transaction.journalDeclaration.findFirst({
        where: { journalId, code: current.code },
        orderBy: { version: 'desc' },
      });
      const version = (latest?.version ?? current.version) + 1;
      if (input.isActive !== false) {
        await transaction.journalDeclaration.updateMany({
          where: { journalId, code: current.code, isActive: true },
          data: { isActive: false },
        });
      }
      const created = await transaction.journalDeclaration.create({
        data: {
          journalId,
          code: current.code,
          version,
          title: nextTitle,
          body: nextBody,
          isRequired: input.isRequired ?? current.isRequired,
          isActive: input.isActive ?? true,
        },
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.declaration_versioned',
        {
          previousDeclarationId: current.id,
          declarationId: created.id,
          code: created.code,
          version: created.version,
        },
      );
      return created;
    });
  }

  async createTemplate(
    journalId: string,
    input: TemplateInput,
    actorId: string,
    requestId: string,
  ) {
    if (await this.hasTemplateSlug(journalId, input.slug)) return 'conflict' as const;
    return database.$transaction(async (transaction) => {
      const template = await transaction.journalTemplate.create({
        data: {
          journalId,
          kind: input.kind,
          slug: input.slug,
          title: input.title,
          body: input.body,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.template_created',
        { templateId: template.id, slug: template.slug, kind: template.kind },
      );
      return template;
    });
  }

  async updateTemplate(
    journalId: string,
    templateId: string,
    input: Partial<TemplateInput>,
    actorId: string,
    requestId: string,
  ) {
    const template = await database.journalTemplate.findFirst({
      where: { id: templateId, journalId },
    });
    if (!template) return null;
    if (
      input.slug &&
      input.slug !== template.slug &&
      (await this.hasTemplateSlug(journalId, input.slug))
    ) {
      return 'conflict' as const;
    }
    return database.$transaction(async (transaction) => {
      const updated = await transaction.journalTemplate.update({
        where: { id: templateId },
        data: input,
      });
      await this.recordAudit(
        transaction,
        actorId,
        requestId,
        journalId,
        'journal.template_updated',
        {
          templateId,
          fields: Object.keys(input),
        },
      );
      return updated;
    });
  }

  private hasSectionSlug(journalId: string, slug: string) {
    return database.journalSection.findFirst({ where: { journalId, slug } }).then(Boolean);
  }

  private hasArticleTypeSlug(journalId: string, slug: string) {
    return database.articleType.findFirst({ where: { journalId, slug } }).then(Boolean);
  }

  private hasTemplateSlug(journalId: string, slug: string) {
    return database.journalTemplate.findFirst({ where: { journalId, slug } }).then(Boolean);
  }

  private async resolveSectionId(journalId: string, sectionId?: string | null) {
    if (sectionId === undefined || sectionId === null || sectionId === '') return null;
    const section = await database.journalSection.findFirst({
      where: { id: sectionId, journalId },
      select: { id: true },
    });
    return section?.id ?? ('invalid' as const);
  }

  private recordAudit(
    transaction: Pick<typeof database, 'auditEvent'>,
    actorId: string,
    requestId: string,
    journalId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return transaction.auditEvent.create({
      data: {
        actorId,
        action,
        targetType: 'Journal',
        targetId: journalId,
        requestId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
