# Changelog
[繁體中文](CHANGELOG.zh-TW.md)

User-visible changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The package version is owned by `package.json`; no public tag/release has been approved yet. During 0.x, minor versions may introduce breaking changes, which must include migration guidance.

## [Unreleased]

The first-release candidate makes the existing creator/member application reproducible with neutral content and operator-owned configuration. It is not a claim that every integration, security boundary or deployment has passed final acceptance. See [release gates](docs/planning/ROADMAP.md).

**Upgrading:** existing operators must review configuration, immutable migrations and paired database/media recovery in [Deployment and Operations](docs/operations/DEPLOYMENT-AND-OPERATIONS.md). Unknown/unregistered public local assets are now denied: register trusted legacy assets before cutover. Review cache purging for previously exposed public copies; code cannot recall prior downloads. Never run demo seeding or test cleanup against live data.

### Added

- **Independent setup:** local PostgreSQL Compose, configuration Doctor, a legal neutral demo and one-time first-admin bootstrap; ordinary member login still requires the operator's Google client.
- **Deployment and recovery:** non-root/read-only production image, single-instance Compose with PostgreSQL and a one-shot migration owner, verified backup manifests, explicit isolated restore drill and repeatable paired local DB/media recovery checks.
- **Contributor and AI guidance:** bilingual entry documents, module/API navigation, runtime Agent OpenAPI discovery and skill coverage checks. The `course-export/v1` core provides validation/planning/apply with storage conformance contracts; this is not blanket end-to-end acceptance of every offering type.
- **Operational evidence:** durable job-run records, explicit scheduler modes and redacted alert integration; manual SBOM/checksum/build-provenance workflow, not automatic publication.

### Changed

- **One shared product:** Apache-2.0 software and separately licensed neutral demo; maintainer and self-host deployments share the same mainline, using configuration rather than private feature forks.
- **Operator-owned defaults:** creator/contact identity, Kit subscription identifiers, Agent origin and maintenance Worker targets no longer implicitly select maintainer services. Local storage is the minimal default; external services, backup writes and jobs are opt-in.
- **Readability and maintenance:** learner/admin contrast tokens improved; typed catalog/progress query owners, route boundary registry and migration integrity checks clarify implementation ownership. CI covers neutral setup/tests/build/smoke without commercial credentials, with hosted execution still requiring a configured repository.

### Fixed

- **Self-host branding:** public pages, FAQ, structured data and default sharing images follow the configured site identity. Product-specific covers still take precedence. The optional maintenance page uses neutral wording.
- **First-run guidance:** separates first-admin setup from everyday Google login, explains empty production sites versus the local demo, and preserves existing environment files when copying templates.

- **Unconfigured member login:** installations without complete Google credentials stay on a local explanatory page instead of automatically navigating to a provider error. Configured Google sign-in retains its existing flow.

- **Portable containers:** shell entrypoints retain LF on Windows clones; bounded log/cache mounts are writable by the non-root runtime without making application code writable.
- **Consistent build boundaries:** normal and profiling builds both quarantine local runtime state outside the standalone payload. Do not distribute the whole `.next` directory.

### Security

- **Legacy Marketplace compatibility break:** its unauthenticated event/timestamp envelope cannot safely authorize fulfillment or refunds. The endpoint now returns 503 without processing, even when a secret is configured. Pause provider delivery and reconcile existing records before upgrading; see [configuration](docs/development/CONFIGURATION.md#legacy-marketplace-unavailable-in-the-first-release). Standard callbacks remain separate and now require a signed event/header match.

- **Framework update:** Next.js and its matching ESLint configuration are pinned to 16.3.8. Auth.js beta.32, Drizzle adapter 1.11.3 and compatible transitive updates are retained. Current Tiptap/KaTeX/selector-parser dispositions are configuration-specific, not patched dependencies or zero-risk claims; see [verification scope](docs/development/DEVELOPMENT-AND-TESTING.md#first-release-verification-scope-2026-10-08).
- **Private media:** public local reads require registered non-private context and allowed lifecycle state; private, unknown and unregistered objects fail closed. Private delivery, verified callbacks, entitlements and Agent destructive confirmation remain release invariants.
- **Secrets and migration history:** custom runtime environment files, uploads and local state stay outside Git; standalone guards exclude copied secrets/logs/backups/Git metadata. Applied migration drift is hash-audited rather than silently accepted; destructive legacy pre-deploy restore is retired.
- **CI permissions:** external actions use reviewed immutable commits; checkout does not persist credentials, and provenance write permissions are limited to the manual evidence job. Local policy regression fixtures check these boundaries.
