# DESIGN.md — Aksara Nusa Global Publishing Design System and UX Specification

- **Document status:** Approved design baseline
- **Applies to:** Public publishing site, author workspace, reviewer workspace, editorial workspace, and administration
- **Design objective:** Credible scholarly publishing with modern operational clarity and a restrained ANG publisher identity
- **Last updated:** 2026-08-20

---

## 1. Design Intent

The interface must feel designed by a serious academic publisher and a disciplined product team, not generated from a generic AI dashboard prompt.

The visual personality is:

- scholarly;
- calm;
- precise;
- trustworthy;
- editorial;
- contemporary without chasing trends;
- efficient for repetitive operational work.

The public site should prioritize reading and discovery. Authenticated workspaces should prioritize decisions, deadlines, and traceable progress.

---

## 2. Anti-Template Rules

The following patterns are prohibited unless a specific, documented use case justifies them:

- neon gradients;
- purple-blue “AI” glow;
- glassmorphism panels;
- random decorative blobs;
- oversized hero text with no scholarly value;
- every section placed inside a floating rounded card;
- excessive 20–32px corner radii;
- icon on every heading;
- large empty dashboard areas filled with vanity metrics;
- repeated four-card feature grids;
- generic stock photos of people holding laptops;
- illustration styles unrelated to academic publishing;
- arbitrary animation on scroll;
- decorative 3D objects;
- dark mode as a substitute for visual direction;
- copied default shadcn/ui styling;
- lorem ipsum or obviously synthetic article titles;
- fake citation, indexing, accreditation, or impact badges.

A page should be recognizable by its information architecture, typography, and content hierarchy—not by decorative effects.

---

## 3. Design Principles

### 3.1 Content first

The manuscript, decision, deadline, policy, and publication metadata are the interface. Decoration must never compete with them.

### 3.2 Editorial rhythm

Use serif typography selectively for journal identity, article titles, issue titles, and long-form reading. Use sans-serif typography for controls and operational data.

### 3.3 Quiet hierarchy

Create hierarchy through type scale, spacing, rules, alignment, and restrained contrast before adding containers or color.

### 3.4 Fewer, stronger surfaces

Not every group needs a card. Use page sections, dividers, inset panels, tables, and definition lists. Reserve cards for genuinely independent objects.

### 3.5 Action clarity

Every page should answer:

- Where am I?
- What is the current state?
- What requires my action?
- What will happen when I continue?

### 3.6 Academic credibility

Avoid marketing exaggeration. Use exact labels, dates, roles, states, policies, and metadata.

### 3.7 Accessible by default

Contrast, focus, keyboard access, error recovery, and readable content are foundational requirements.

---

## 4. Visual Direction

### 4.1 Concept

**“Modern editorial desk with ANG publisher identity.”**

The visual reference is a high-quality scholarly journal combined with a precise editorial workflow system:

- paper-like reading surfaces;
- dark ink typography;
- thin editorial rules;
- ANG navy as the primary trust and action color;
- restrained gold rules and accents inspired by the approved publisher lockup;
- warm neutral backgrounds rather than sterile pure white everywhere;
- compact operational density without becoming cramped.

### 4.2 Brand distinction

The project must not visually imitate Scopus, SINTA, OJS, Elsevier, Springer Nature, Wiley, Taylor & Francis, or another publisher.

It may follow familiar scholarly usability conventions, but brand marks, color systems, component appearance, and page composition must remain original.

### 4.3 Publisher identity

- The canonical public name is **Aksara Nusa Global Publishing**; **ANG Publishing** is the approved compact label.
- Use the horizontal ANG lockup on public chrome and identity entry points. Keep its aspect ratio, whitespace, navy, and gold intact.
- Gold is decorative or used for large/high-contrast accents. Use the darker accessible gold token for text and controls.
- The publisher address and legal contact details must remain configurable and must not be copied from a visual reference without owner confirmation.

---

## 5. Design Tokens

Define tokens once in `packages/ui/tokens` and expose them as CSS custom properties and Tailwind theme values.

## 5.1 Color

### Light theme baseline

```css
:root {
  --color-canvas: #f7f6f2;
  --color-surface: #ffffff;
  --color-surface-subtle: #faf9f6;
  --color-surface-inset: #efede7;

  --color-ink: #101b2a;
  --color-ink-muted: #58616b;
  --color-ink-subtle: #7a828a;
  --color-ink-inverse: #ffffff;

  --color-border: #d9d6ce;
  --color-border-strong: #b7b2a8;

  --color-brand: #09264a;
  --color-brand-hover: #061b35;
  --color-brand-soft: #eaf0f6;

  --color-accent: #8a6200;
  --color-accent-decorative: #d9a520;
  --color-accent-soft: #f7edd0;

  --color-success: #276749;
  --color-success-soft: #e7f3ec;
  --color-warning: #8a5a12;
  --color-warning-soft: #fbf0d8;
  --color-danger: #a33a35;
  --color-danger-soft: #f9e9e7;
  --color-info: #285b85;
  --color-info-soft: #e8f1f8;

  --color-focus: #2563eb;
}
```

The exact values may be tuned after contrast testing. Do not introduce new one-off colors in feature components.

### Dark theme

Dark mode is optional after the light theme is complete. It must be token-driven and tested for long-form readability. Do not delay MVP workflow completion to build it.

## 5.2 Typography

### Approved font pairing

- **Editorial serif:** Source Serif 4
- **Interface sans:** IBM Plex Sans
- **Monospace:** IBM Plex Mono

Load through `next/font` where available. Use a system fallback stack. Do not bundle unlicensed font files.

### Usage

- Publisher lockup: approved ANG image asset, never reconstructed with interface fonts
- Journal wordmark: serif, medium or semibold
- Article and issue title: serif
- Long-form abstract or article text: serif or carefully tested reading style
- Navigation, forms, tables, status, metadata, and controls: sans-serif
- IDs, code, DOI snippets, and technical logs: monospace sparingly

### Type scale

```text
Display:       clamp(2.25rem, 5vw, 4.5rem) / 0.98
Page title:    clamp(1.9rem, 3vw, 3rem) / 1.08
Section title: 1.5rem / 1.25
Subsection:    1.125rem / 1.35
Body large:    1.0625rem / 1.65
Body:          1rem / 1.55
Body small:    0.875rem / 1.45
Caption:       0.75rem / 1.4
```

Operational interfaces may use 14px body text in dense tables, but never below 12px for essential content.

## 5.3 Spacing

Use a 4px base scale:

```text
1: 4px
2: 8px
3: 12px
4: 16px
5: 20px
6: 24px
8: 32px
10: 40px
12: 48px
16: 64px
20: 80px
24: 96px
```

Page sections should normally use 48–80px vertical spacing on desktop and 32–48px on mobile.

## 5.4 Radius

```text
Control: 6px
Panel: 8px
Dialog: 10px
Pill: 999px only for compact status or tags
```

Do not use giant rounded rectangles as a default visual motif.

## 5.5 Shadow

Use borders before shadows.

```css
--shadow-popover: 0 12px 32px rgba(23, 32, 42, 0.14);
--shadow-dialog: 0 24px 64px rgba(23, 32, 42, 0.2);
```

Ordinary cards and tables should usually have no shadow.

## 5.6 Motion

- Fast feedback: 120–160ms
- Standard transition: 180–220ms
- Complex panel: maximum 300ms
- Use ease-out for entering and ease-in for leaving
- Respect `prefers-reduced-motion`
- No scroll-triggered decorative animation in operational pages

---

## 6. Layout System

## 6.1 Public site

- Maximum outer width: 1280px
- Standard horizontal padding: 24px desktop, 16px mobile
- Article reading width: 720–780px
- Metadata side rail: 260–320px when space permits
- Use a 12-column grid on desktop
- Public article page may use an 8/4 reading-plus-metadata split

## 6.2 Authenticated workspace

Desktop structure:

```text
┌─────────────────────────────────────────────────────────────┐
│ Global header: journal switcher, search, notifications, user│
├──────────────┬──────────────────────────────────────────────┤
│ Side nav     │ Page header                                   │
│ 240px        │ Context, status, actions                      │
│              ├──────────────────────────────────────────────┤
│              │ Main work area                                │
└──────────────┴──────────────────────────────────────────────┘
```

- Side navigation width: 232–248px
- Content maximum: 1440px where tables require it
- Form content width: 760–920px
- Sticky contextual action bar allowed for long workflows
- Side navigation collapses to a drawer below desktop breakpoint

## 6.3 Breakpoints

Use content-driven breakpoints approximately equivalent to:

```text
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

Do not hide critical functionality on mobile. Recompose it.

---

## 7. Navigation Architecture

## 7.1 Public header

Contents:

- ANG publisher lockup or journal wordmark;
- Journals;
- Current Issue;
- Archives;
- About;
- Search;
- Submit Manuscript;
- Sign In or user menu.

For a journal page, navigation should be journal-scoped. Avoid a huge marketing mega-menu.

## 7.2 Workspace navigation

Author default:

- Overview
- Submissions
- Tasks
- Notifications
- Profile

Reviewer adds:

- Review Assignments

Editorial role adds:

- Editorial Queue
- Reviews
- Production
- Issues
- Reports

Journal manager adds:

- Journal Settings

Platform admin uses a clearly separated administration area to avoid accidental context confusion.

## 7.3 Breadcrumbs

Use breadcrumbs for deep operational pages and nested public archives. Do not use breadcrumbs on the homepage or simple top-level dashboards.

---

## 8. Core Components

Use Radix primitives and adapted shadcn/ui components only as low-level accessibility foundations. Apply the project's own tokens and composition.

## 8.1 Buttons

Variants:

- Primary
- Secondary
- Quiet
- Destructive
- Link

Rules:

- One dominant primary action per region.
- Button labels use verbs: `Submit manuscript`, `Invite reviewer`, `Release decision`.
- Avoid vague labels such as `Proceed`, `OK`, or `Process` where a precise verb exists.
- Destructive actions require consequence-aware confirmation.
- Icon-only buttons require accessible names and tooltips when the icon is not universally obvious.

## 8.2 Status labels

Use compact labels with icon or text distinction. Examples:

- Draft
- Screening
- Under review
- Revision required
- Accepted
- In production
- Scheduled
- Published
- Rejected
- Overdue

Never use status color alone. Status wording must match domain enums through a centralized mapping.

## 8.3 Tables

Use TanStack Table for complex operational tables.

Required capabilities when applicable:

- sortable columns;
- filters reflected in URL;
- column visibility;
- row selection for legitimate bulk actions;
- pagination;
- loading skeleton;
- empty state;
- error state;
- sticky header on long lists;
- responsive alternative for narrow screens.

Avoid turning every row into a giant card on desktop.

## 8.4 Forms

Use React Hook Form and shared field components.

Each field includes:

- persistent label;
- optional help text;
- required marker with textual explanation;
- inline validation;
- accessible error association;
- character or word count where meaningful.

Long forms:

- group by meaningful sections;
- save draft automatically;
- show last-saved state;
- provide error summary after failed submission;
- move focus to the first invalid field;
- warn before leaving with unsaved changes.

## 8.5 File upload

The upload component must show:

- accepted formats and size;
- selected purpose;
- filename and size;
- progress;
- scan or processing state;
- failure reason and retry;
- visibility audience;
- replace and remove actions subject to workflow rules.

Never imply an upload is complete before server confirmation and scanning status are known.

## 8.6 Timeline

Use a vertical timeline for submission history.

Each event shows:

- state or action;
- date and time;
- responsible role or person when visible;
- short description;
- linked decision or file when authorized.

Confidential events are excluded from unauthorized views, not merely visually hidden.

## 8.7 Dialogs and drawers

Use dialogs for focused confirmation or short tasks. Use side drawers for contextual details that benefit from retaining the list view.

Do not put entire multi-step workflows in a modal.

## 8.8 Toasts and alerts

- Toast: transient confirmation for completed reversible or low-risk action
- Inline alert: important persistent context or recoverable error
- Banner: system-wide or journal-wide notice
- Dialog: high-risk confirmation

Never use a success toast as the only evidence of a critical workflow transition. The page state must also update.

## 8.9 Rich text

Use TipTap only where structured rich text is genuinely needed, such as policy content or controlled editorial letters.

Do not use a rich-text editor for manuscript editing in MVP.

Sanitize all rendered rich text server-side and client-side as appropriate.

---

## 9. Page Specifications

## 9.1 Platform homepage

Purpose: explain the publishing platform and help users locate journals or begin a submission.

Composition:

1. Restrained masthead with product proposition
2. Journal search or browse control
3. Featured or recently published articles, if real data exists
4. Participating journals
5. Clear publisher trust and policy links
6. Footer with contact, privacy, accessibility, and status links

Avoid a startup-style hero with meaningless metrics or decorative gradient art.

## 9.2 Journal landing page

Top area:

- journal title and abbreviation;
- concise aims and scope;
- current issue link;
- submit-manuscript action;
- ISSN only when legitimate;
- indexing/accreditation area only when verified and administratively approved.

Main content:

- current issue feature;
- latest articles;
- announcements;
- key journal information;
- editorial and policy links.

The journal cover may appear, but it should not dominate usability.

## 9.3 Issue archive

- Group by year and volume.
- Show issue title, volume, number, date, cover, and article count.
- Support accessible filtering.
- Do not use an infinite masonry grid.

## 9.4 Issue page

- Issue identity at top
- Optional cover
- Description or editorial
- Table of contents grouped by section
- Article rows with title, authors, pages or eLocator, and galley link
- Citation and issue metadata

Prefer a structured table-of-contents rhythm over cards.

## 9.5 Article page

Desktop structure:

```text
Main reading column                    Metadata rail
-----------------------------------------------------------
Article type / section                 Journal
Title                                  Volume / issue
Authors                                Publication date
Affiliations                           DOI
Abstract                               License
Keywords                               Download
Main text or references                Citation tools
```

Requirements:

- prominent title and accurate author order;
- superscript affiliation mapping that remains accessible;
- abstract with comfortable reading width;
- clear PDF/HTML access;
- copy citation and export options only when functional;
- correction or retraction notice displayed above content;
- no fake citation count;
- references displayed as structured list when available;
- sticky metadata rail only when it does not harm reading.

## 9.6 Author dashboard

The dashboard is task-oriented, not analytics-heavy.

Top:

- `Submit a manuscript` primary action
- Tasks requiring action
- Submission summary by state

Main:

- active submissions table;
- recent decisions;
- messages or notifications;
- draft submissions.

Avoid vanity charts for authors.

## 9.7 Submission wizard

Steps:

1. Start and journal requirements
2. Article details
3. Authors and affiliations
4. Files
5. Declarations
6. Review and submit

Desktop:

- left step navigation;
- main form;
- optional right summary rail for requirements and save state.

Mobile:

- compact progress indicator;
- one-column form;
- sticky back and continue controls that do not cover fields.

Requirements:

- autosave;
- explicit saved status;
- step-level validation;
- final full validation;
- summary before irreversible submission;
- no accidental double submission.

## 9.8 Submission detail

Header:

- submission ID;
- title;
- current status;
- journal;
- role-appropriate primary action.

Tabs or sections:

- Overview
- Files
- Review
- Editorial decision
- Copyediting
- Production
- History
- Messages

Only show sections the role may access. Do not show disabled confidential tabs that reveal hidden process details.

## 9.9 Reviewer workspace

Invitation page:

- manuscript title only if allowed by blind policy;
- abstract and keywords according to policy;
- journal and due dates;
- confidentiality statement;
- conflict declaration;
- accept and decline actions.

Review page:

- persistent deadline;
- manuscript files;
- journal criteria;
- structured questions;
- comments to author;
- confidential comments to editor;
- recommendation;
- save draft;
- final submission confirmation.

Visually distinguish confidential fields with wording and restrained inset styling, not alarming decoration.

## 9.10 Editorial queue

This is the operational heart of the application.

Header:

- queue title;
- saved views;
- global search;
- compact filters;
- export only when approved.

Table columns may include:

- submission ID;
- title;
- section;
- current stage;
- assigned editor;
- next required action;
- nearest deadline;
- age in stage;
- flags.

Use calm urgency:

- overdue items receive text and icon;
- do not paint whole rows bright red;
- default sorting prioritizes actionable overdue items.

## 9.11 Editorial submission workspace

Use a three-region layout on wide screens:

1. manuscript and metadata;
2. current stage content;
3. action and deadline rail.

Key actions such as reviewer invitation and decision release must show prerequisite checks.

Do not bury the current round, manuscript version, or due dates.

## 9.12 Issue builder

- issue metadata form;
- unpublished accepted-article pool;
- ordered table of contents;
- drag-and-drop only as an enhancement, with keyboard controls and explicit move buttons;
- publication preview;
- validation checklist;
- schedule or publish action.

## 9.13 Administration

Admin UI should be dense and sober.

- Use definition lists, tables, and forms.
- Separate platform settings from journal settings.
- Show dangerous settings with scope and consequence.
- Audit-log filters must be efficient and readable.
- System status should show factual state, not decorative gauges.

---

## 10. Content Design

### 10.1 Voice

Use language that is:

- precise;
- respectful;
- neutral;
- action-oriented;
- transparent about consequences.

Avoid:

- hype;
- anthropomorphic AI language;
- vague success claims;
- punitive wording;
- unexplained editorial jargon.

### 10.2 Examples

Good:

- `Submit manuscript`
- `Invite reviewer`
- `Request major revision`
- `This decision will be sent to the corresponding author.`
- `The manuscript file is still being scanned.`

Weak:

- `Continue process`
- `Do action`
- `Awesome! Your paper is on its journey.`
- `AI has evaluated your submission.`

### 10.3 Dates and deadlines

Show an absolute date and, when useful, a relative hint:

```text
12 August 2026, 23:59 WIB · due in 9 days
```

Do not rely only on `tomorrow` or `3 days ago`.

### 10.4 Empty states

Every empty state should explain:

- what is absent;
- whether that is expected;
- the next valid action.

Do not fill empty states with decorative illustrations unless they add information.

---

## 11. Accessibility Requirements

Target WCAG 2.2 AA.

### Required

- Semantic landmarks and headings
- Skip link
- Keyboard-accessible navigation and workflows
- Visible 2px or stronger focus indicator
- Minimum target size appropriate for touch
- Labels for all controls
- Error summary plus field errors
- Live regions for meaningful async status
- Proper table headers and captions
- Dialog focus trap and focus return
- Reduced-motion support
- Sufficient contrast in all states
- Reflow at 200% zoom
- No horizontal scrolling for ordinary content at narrow widths
- Accessible alternative to drag-and-drop
- Screen-reader text for status icons

### File and PDF accessibility

The platform can encourage or validate accessible publication files, but it must not falsely claim that an uploaded PDF is accessible without actual validation.

---

## 12. Responsive Behavior

### Mobile priorities

- current status;
- next action;
- deadline;
- manuscript title;
- essential communication;
- file access.

Operational tables become:

- horizontally scrollable only as a last resort;
- compact row summaries with expandable details;
- or a purpose-built mobile list.

Do not hide bulk actions on small screens without an alternative.

### Tablet

Use split views carefully. Submission forms remain mostly one column to reduce errors.

### Wide desktop

Use width for context, not empty space. Add metadata rails, comparison panels, and stable action columns where useful.

---

## 13. Libraries and Their Boundaries

### Required or approved

- **Tailwind CSS 4:** token-based utility styling
- **Radix UI:** accessible low-level primitives
- **shadcn/ui:** selectively imported source components, fully restyled
- **TanStack Table:** operational data tables
- **React Hook Form:** form state
- **Zod:** shared validation schemas where appropriate
- **Lucide React:** restrained interface icon set
- **TipTap:** controlled rich-text fields only
- **Playwright:** E2E and selected visual regression
- **axe tooling:** automated accessibility checks
- **Storybook:** shared component development and state documentation
- **Recharts:** limited internal operational charts only when a chart is the clearest representation

### Use only when justified

- PDF.js for controlled in-browser PDF preview
- dnd-kit for accessible issue ordering or file ordering
- Framer Motion for complex interaction that CSS cannot express cleanly

### Avoid by default

- large animation libraries;
- multiple icon libraries;
- chart libraries on public article pages;
- generic page-builder systems;
- unreviewed WYSIWYG HTML output;
- heavy client state management when server state and URL state are sufficient.

Before adding a dependency, confirm:

1. the existing stack cannot solve the requirement cleanly;
2. it is actively maintained;
3. it supports accessibility and SSR requirements;
4. its bundle and security cost are acceptable;
5. its purpose is documented in the pull request.

---

## 14. Icons, Images, and Illustration

### Icons

- Use Lucide consistently.
- Default size: 16–20px.
- Icons support labels; they do not replace uncommon labels.
- Avoid filled multicolor icons in operational interfaces.

### Journal covers

- Preserve aspect ratio.
- Provide meaningful alt text when the cover conveys information.
- Use empty alt when purely decorative and the issue identity is already present in text.

### People photography

Avoid generic stock imagery. Editorial board pages should use real approved portraits or text-only profiles.

### Diagrams

Use simple diagrams for workflow or author guidance. Follow brand tokens and provide textual alternatives.

---

## 15. Data Visualization

Charts are secondary and mostly restricted to editorial reporting.

Approved examples:

- submissions over time;
- median decision time;
- overdue review trend;
- stage distribution;
- reviewer invitation outcomes.

Rules:

- start with the analytical question;
- include units and date range;
- use direct labels where possible;
- provide a table alternative;
- avoid 3D, gauges, donuts with many categories, and decorative gradients;
- do not represent downloads as citations;
- do not rank research quality from simple activity metrics.

---

## 16. Loading, Empty, Error, and Permission States

Every data-driven component must implement all applicable states.

### Loading

- Use skeletons matching final layout.
- Do not block the entire workspace for one secondary panel.
- Show upload and job progress when known.

### Empty

- Explain whether the user has no data or filters removed all results.
- Provide one relevant action.

### Error

- State what failed in plain language.
- Preserve entered data when safe.
- Provide retry or recovery action.
- Show a request ID for support on server errors.

### Permission denied

- Do not reveal confidential resource details.
- Explain that access is unavailable.
- Do not suggest requesting access when no such process exists.

### Partial external failure

Example: article published but DOI deposit failed.

- Public article remains available.
- Authorized staff see a clear integration-status warning and retry action.
- Readers do not see internal credentials or technical stack traces.

---

## 17. Design QA Checklist

A material page is not complete until it passes:

### Visual

- Uses approved typography and tokens
- Has deliberate hierarchy without excessive cards
- Does not resemble default shadcn or an AI starter template
- Aligns to grid and spacing scale
- Uses realistic scholarly content
- Handles long titles, many authors, and long affiliations

### Interaction

- Primary action is clear
- Destructive action communicates consequence
- Loading, empty, error, success, and disabled states exist
- URL preserves meaningful filters
- Form state survives expected navigation or refresh
- No dead control exists

### Responsive

- Works at 360px, 768px, 1024px, and 1440px representative widths
- Critical actions remain available
- Tables have a mobile strategy
- Sticky regions do not cover content

### Accessibility

- Keyboard journey works
- Focus order is logical
- Focus indicator is visible
- Labels and errors are announced
- Contrast passes
- Headings are hierarchical
- Motion respects user preference

### Domain

- Status label matches backend state
- Confidential data is not rendered
- Absolute dates are present for deadlines
- Indexing and DOI claims are verified

---

## 18. Visual Acceptance Artifacts

For material UI changes, the agent should produce or update:

- desktop screenshot;
- mobile screenshot;
- relevant component states in Storybook;
- visual regression baseline where configured;
- short note explaining any intentional deviation from this document.

Do not approve a page based only on component code.

---

## 19. Initial Component Inventory

Create components in this order:

### Foundation

- Theme tokens
- Typography styles
- Container and grid
- Button
- Link
- Form field
- Input, textarea, select, checkbox, radio
- Badge/status label
- Alert
- Dialog
- Dropdown menu
- Tabs
- Tooltip
- Skeleton
- Empty state

### Scholarly content

- Journal masthead
- Article title block
- Author and affiliation list
- Citation metadata list
- Abstract section
- Keyword list
- Galley download
- Issue table of contents
- Publication notice
- Reference list

### Workflow

- Workspace shell
- Page header
- Task list
- Submission status timeline
- Deadline indicator
- File upload and file row
- Submission stepper
- Reviewer invitation panel
- Review form section
- Decision composer
- Audit event list
- Operational data table

Do not build the entire component library before implementing real vertical slices. Extract components from proven repeated needs.

---

## 20. Changelog

- **2026-08-20:** Adopted the Aksara Nusa Global Publishing lockup and accessible ANG navy-gold theme for public chrome and identity entry points, including responsive and brand-integrity rules.

- **2026-08-03:** Initial visual direction, anti-template rules, tokens, layouts, navigation, page specifications, component boundaries, responsive behavior, accessibility, and design QA criteria.
