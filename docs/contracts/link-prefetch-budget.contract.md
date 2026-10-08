---
schema_version: behavior-contract/v1
id: shared.link-prefetch-budget
title: First-party Link prefetch budget
status: active
owner_surface: shared
change_context:
  type: bugfix
  reason: Reduce background route/RSC requests caused by automatic prefetching of dynamic pages.
  non_goals:
    - Do not change the destination URL or click navigation behavior.
    - Do not change authentication, authorization, database, content, analytics, or deployment configuration.
    - Do not add a new speculative-loading dependency or replacement prefetch system in this fix.
---

# First-party Link prefetch budget

CabAI turns off automatic prefetch for its internal links. This avoids loading dynamic pages before someone chooses to visit them; clicking a link still works normally.

## Change Context

Production observation showed that the site can accumulate megabytes of Network transfer while a page remains open. The deployed codebase contains many first-party `next/link` instances and most destination routes are dynamic, so automatic viewport prefetching is an unnecessary server and network side effect for this product surface.

## Behavior Boundary

In scope:

- First-party `next/link` instances rendered by the CabAI application.
- Admin, member, public navigation, content cards, course navigation, and rotating offering CTAs.
- Preventing automatic viewport/hover prefetch while leaving normal click navigation available.

Out of scope:

- API fetches made by an explicit user action.
- The existing authenticated page-view tracking event.
- The existing six-second featured-offering presentation timer; it may continue to rotate UI state after Link prefetch is disabled.
- Static asset caching, CDN settings, database queries, or production deployment settings.

## Entrypoints And Consumers

- `src/components/layout/admin-sidebar.tsx`
- `src/components/layout/member-sidebar.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/mobile-drawer.tsx`
- `src/components/course/chapter-sidebar.tsx`
- Public home, product, Library, Skill, community, course, and result surfaces using `next/link`.

## Inputs And State

- A first-party `Link` enters the browser viewport or receives a hover signal.
- The destination route may be dynamic and may require server/auth/database work.
- The user may still click the link and navigate normally.

## Outputs And Side Effects

Expected after the change:

- First-party links render with `prefetch={false}`.
- Merely opening a page, waiting idle, hovering, or scrolling does not cause Next.js to prefetch those destination routes.
- Clicking a link still performs the normal navigation to the same `href`.
- No database writes or content mutations occur from the navigation change.

## UI States

- First paint: same visible links and labels as before.
- Ready: links remain keyboard-, pointer-, and touch-accessible.
- Navigation: click behavior and destination remain unchanged; only background prefetch is removed.
- Teardown: no new timer, subscription, or polling behavior is introduced.

## Invariants

- Every first-party `next/link` in `src` explicitly opts out of automatic prefetch.
- Existing `href`, labels, active states, accessibility attributes, and click handlers remain unchanged.
- External `<a>` links and API calls are not rewritten.
- No route becomes inaccessible because of this change.

## Acceptance Examples

1. Given a user opens Admin Library and does nothing, when the page remains idle for 15 seconds, then no new Next.js route/RSC prefetch requests are caused by first-party links.
2. Given a user scrolls through a public content list, when new cards enter the viewport, then cards do not automatically request their detail routes.
3. Given a user clicks an admin, member, public, course, Library, Skill, or product link, then the browser navigates to the same destination as before.
4. Given the featured banner rotates, when its CTA changes, then the carousel may update visually but does not prefetch the new CTA route automatically.

## Test Mapping

```yaml
test_mapping:
  static:
    - rg audit: every first-party <Link> has prefetch={false}
  unit:
    - Existing navigation and component tests remain green.
  e2e:
    - Existing route/navigation suites remain green.
  manual:
    - Chrome production read-back: initial load, idle, hover, scroll, carousel rotation, and click navigation.
```

## Evidence

Check first-party `Link` props in source, then inspect browser network traffic during idle, hover, scroll and click. The expected behavior is described in [Next.js prefetching guidance](https://nextjs.org/docs/app/guides/prefetching). Recheck actual behavior after framework upgrades.

## Intentional Changes

- Automatic first-party route prefetch is intentionally disabled to stop unrequested dynamic route/RSC work. Click navigation is intentionally preserved.

## Open Questions

- After this fix, production request and server-cost measurements should determine whether a small, explicitly allowlisted prefetch set is worth reintroducing for static/high-confidence destinations.
