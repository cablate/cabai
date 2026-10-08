---
schema_version: behavior-contract/v1
id: ui.library-skill-public-admin
title: Library and Skill Public and Admin UI
status: active
owner_surface: web
change_context:
  type: feature
  reason: WP-07 gives people a governed browser UI over the canonical Library, Skill, artifact, and Information services completed in WP-01 through WP-06.
  non_goals:
    - Homepage legacy free-resource cutover or bulk migration
    - A Collection domain or attachment delivery model for Library
    - User-selectable Agent permissions
    - Active notification delivery
    - Dedicated keyboard shortcuts or a complete keyboard-navigation acceptance program
    - Production publication or R2 canary evidence
---

# Library and Skill Public and Admin UI

This spec describes the public Library and Skill pages and their admin editors: what each page shows, how publication works, and what users see when content is missing or unavailable.

## Change Context

This contract defines the current domain boundary. It adds human-facing public discovery and an administrator workflow without creating a second content model or bypassing the canonical services. Legacy homepage resource classification is a separate responsibility.

## Behavior Boundary

In scope:

- Public `/library` and `/library/[slug]` pages for published free Markdown articles.
- Public `/skills` and `/skills/[slug]` pages for published Skills and visible releases.
- Admin Library, Skill, Skill Release, and Information authoring workflows.
- Readiness, publish confirmation, Information coverage and read statistics where supported by canonical services.
- Conditional public navigation that appears only when the corresponding published domain has content.
- Loading, empty, error, deprecated, withdrawn, missing-artifact, unauthorized, and responsive states that are reachable on each surface.
- Metadata and sitemap discovery for published Library and Skill URLs.

Out of scope:

- Moving legacy homepage `FREE_TYPES` items into Library or Skill.
- Flattening Library, Skills, and Products into one undifferentiated catalog.
- Rendering PDF or other attachments inside Library. Authors use ordinary links.
- Direct browser access to draft or withdrawn public content.
- Direct database mutation from UI code.
- Dedicated keyboard-operation features or keyboard-only acceptance. Normal semantic elements, native controls, labels, and existing focus behavior remain required and must not regress intentionally.

## Public Experience

### Library

- The index lists only published entries from `listPublishedLibraryEntries`, ordered by the canonical service.
- Featured and latest are presentation groupings over the same entries. Tags are lightweight filters or labels, not a new Collection entity.
- The detail page resolves through `getPublishedLibraryEntry`; missing, draft, and withdrawn entries return the public not-found state.
- The detail page renders only content that passed the canonical Library Markdown validator. Raw HTML and Markdown images remain prohibited; HTTPS and site-relative links remain ordinary links.
- The browser UI renders Markdown for people. Agent API continues to own the raw `bodyMarkdown` projection.

### Skills

- The index lists only canonical public Skill projections.
- The detail page distinguishes the current release from release history and displays version, status, license, compatibility, SHA-256 checksum, changelog, access policy, and download state.
- Deprecated releases remain visible and are clearly labelled. Withdrawn releases and Skills are not publicly discoverable.
- Public artifacts use the existing public download endpoint. Authenticated-only releases explain that sign-in or a User Agent token is required; the public page does not invent a weaker download path.
- Missing or invalid artifact evidence never produces a download URL and is presented as temporarily unavailable.

### Navigation and homepage

- `/library` is added to public navigation only when at least one published Library entry exists.
- `/skills` is added only when at least one public Skill exists.
- WP-07 may add an explanatory pointer from the homepage but does not remove or reclassify legacy free-resource sources.

## Admin Experience

- Admin pages authenticate through the existing Admin layout and server-action guard.
- Pages read and mutate through Library, Skill Release, publication bundle, artifact, and Information services. UI modules must not import `db` or schema mutation primitives.
- Create and update forms preserve optimistic revision checks and display field-level or contextual canonical failures.
- Published Library and Skill changes that require Information use the existing bundle publisher so partial publication cannot occur.
- Publish is an explicit confirmation action and is disabled by readiness failures, not by a parallel client-only validator.
- Library authoring includes a Markdown preview using the same human renderer as the public page. Preview does not weaken server-side validation.
- Skill Release authoring exposes access policy as the owner-approved `public` or `authenticated` choice and reports artifact binding/readiness separately from descriptive metadata.
- Information pages expose lifecycle, action/source identity, readiness, history, coverage, and read statistics where the canonical service provides them.
- Withdrawn records remain visible to administrators with their state and allowed follow-up actions.

## UI States

- Loading uses shape-matched skeletons or existing route loading states.
- Empty states explain what the domain contains and, in Admin, the next legitimate creation action.
- Canonical `not-found` maps to a not-found or inline missing state according to route context.
- `validation-failed`, `conflict`, and readiness issues remain actionable and identify affected fields when evidence exists.
- `prerequisite-unavailable` and artifact failures do not masquerade as missing content or successful publication.
- Layouts collapse to one readable column on narrow screens; long checksums and Markdown content wrap without widening the viewport.

## Mutation And Trust Invariants

- Browser UI is an adapter. Canonical services remain lifecycle, validation, visibility, authorization, Information, and artifact owners.
- Public and Admin pages never copy authorization rules from Agent routes as an independent policy implementation.
- No public page reveals draft, withdrawn, authenticated artifact, or paid Course content.
- Published Skill Release content remains immutable under the existing service contract.
- Information action identity remains bound to current OpenAPI method, path, credential class, and operation ID.
- A successful UI message is shown only after the canonical mutation succeeds.
- Product, Library, and Skill labels remain distinct: Products are commercial offers, Library is free text knowledge, and Skills are versioned downloadable agent capabilities.

## Acceptance Examples

```gherkin
Scenario: empty domains do not create dead navigation
  Given there are no published Library entries and no public Skills
  When a visitor opens the site
  Then the main navigation does not show Library or Skills links

Scenario: a published Library entry is readable in the browser
  Given a Library and required Information bundle was published successfully
  When a visitor opens /library/{slug}
  Then the title, summary, tags, publication time, and validated Markdown are rendered
  And ordinary links remain links
  And raw HTML is not rendered

Scenario: authenticated Skill is described but not leaked
  Given a published Skill release uses authenticated access
  When an anonymous visitor opens its public detail page
  Then metadata, compatibility, license, checksum, and changelog are visible
  And the page reports authentication is required
  And no artifact target is generated by the page

Scenario: release artifact evidence is missing
  Given a visible release no longer has verified artifact evidence
  When its detail or Admin workflow is opened
  Then download is unavailable
  And the UI identifies the artifact prerequisite failure
  And no broken URL is presented

Scenario: Admin publication stays atomic
  Given an administrator edits a draft Library entry and its required Information
  When readiness succeeds and the administrator confirms publish
  Then the UI calls the canonical bundle publisher
  And success is shown only if both records publish
  And a partial failure leaves both drafts unclaimed as published

Scenario: concurrent edit is rejected
  Given two Admin sessions opened the same draft revision
  When the second session saves after the first session changed it
  Then the canonical conflict is displayed
  And the newer content is not overwritten
```

## Verification

- Focused component tests for public grouping, release/download states, form feedback, preview, and publish confirmation.
- Focused service-adapter or action tests proving UI mutations call canonical services and do not import direct DB mutations.
- Browser tests for public list/detail, Admin create/edit/readiness/publish, responsive layout, and visible error states.
- Metadata, sitemap, and internal-link checks for published content.
- Existing lint, typecheck, UI foundation, route-boundary, and package verification gates at WP-07 close.
- Dedicated keyboard shortcut and complete keyboard-navigation testing are intentionally excluded by owner decision on 2026-07-17; this does not authorize replacing semantic controls with non-semantic click targets.

## Evidence Anchors

- `src/lib/services/library-service.ts`
- `src/lib/services/skill-release-service.ts`
- `src/lib/services/skill-artifact-service.ts`
- `src/lib/services/information-service.ts`
- `src/lib/services/publication-bundle-service.ts`
- `src/lib/library-markdown.ts`
- `src/components/ui/markdown.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/admin-sidebar.tsx`
- `docs/contracts/public-user-agent-library-skill-information.md`
- `docs/contracts/skill-information-vertical-evidence.md`

## Update Rule

Update this contract when public visibility, Skill access policy, Admin lifecycle ownership, Information coupling, artifact failure behavior, route structure, or WP-08 cutover behavior changes. Visual-only adjustments that preserve these behaviors do not require a contract revision.
