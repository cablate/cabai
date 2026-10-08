---
schema_version: behavior-contract/v1
id: storage.skill-artifact-pipeline
title: Skill artifact upload, validation, repair, and download
status: active
owner_surface: infrastructure
change_context:
  type: feature
  reason: WP-03 must turn a Skill release's media reference into verifiable artifact evidence before publication or download.
  non_goals:
    - Execute or install uploaded Skill content.
    - Accept public or third-party uploads.
    - Add a second R2 backup system or promise permanent availability.
    - Add public or User Agent HTTP routes; those remain WP-05.
---

# Skill Artifact Pipeline Contract

A hosted Skill release needs a ZIP that the server can read and validate before publication. This spec covers upload, checksum and archive checks, download links, and restoring a missing file with the same bytes.

## Change Context

This contract defines the current domain boundary. The existing StorageProvider, media registry, and Skill release domain service remain the canonical owners. The implementation adds server-side bounded object reads because checksum and archive verification cannot be proven from a signed URL or `HEAD` metadata alone.

The initial engineering limits are conservative defaults, not a product promise: ZIP bytes at most 20 MiB, aggregate uncompressed bytes at most 100 MiB, at most 1,000 entries, path depth at most 16 segments, each entry at most 20 MiB, and root `SKILL.md` at most 256 KiB. Changes to these values require tests and this contract to be updated.

## Behavior Boundary

In scope:

- `skill-artifact` uploads by an admin session or an Admin Agent with `media:write`. Confirming/binding a Skill release additionally requires `skill:write`, including retries; rejection occurs before media lookup, storage verification or release/media mutation.
- Binding confirmed media only to a draft `skillRelease`.
- Server-side byte reads bounded before allocation and after receipt.
- ZIP structure and content validation without executing archive content.
- SHA-256 calculation, root `SKILL.md` projection, and persisted validation evidence.
- Readiness evidence for Skill release publication.
- Short-lived controlled download targets for published or deprecated releases.
- Exact-byte repair of a missing object at the original media key.
- Explicit cleanup/orphaning of abandoned draft artifacts.

Out of scope:

- HTTP routes for public/User Agent Skill discovery or download.
- Entitled/paid Skill policy.
- Antivirus or malware-safety claims.
- Automatic deletion of published artifacts.
- Automatic conversion of RAR, 7z, tar, gzip, or nested archives.

## Consumers And Entrypoints

- `POST /api/upload`
- `POST /api/upload/confirm`
- `StorageProvider.readObject(key, maxBytes)`
- Skill artifact archive validator
- Skill artifact service used by readiness, future Admin routes, and future public/User Agent routes
- `media` and `skill_releases` rows
- Storage provider conformance, unit, contract, and integration tests

## Inputs And State

- Upload format is `.zip` with `application/zip` or `application/x-zip-compressed`.
- A root entry named exactly `SKILL.md` is required and must be non-empty UTF-8 text without NUL bytes.
- Optional YAML frontmatter is data-only. Only scalar `name` and `description` are projected; arbitrary fields are not executed or trusted as product facts.
- Media must be `confirmed`, use context `skill-artifact`, be bound to entity type `skillRelease`, and match the target release ID.
- The Skill release must exist. Initial binding/replacement is allowed only while it is `draft`.
- Stored object length and MIME must match the media registry before archive validation.

## Outputs And Side Effects

- Validation computes lowercase SHA-256 over the exact uploaded ZIP bytes.
- A successful validation saves checksum, manifest projection, validation summary, and validation timestamp on the draft release and increments its revision.
- Repeating confirmation for the same already-bound artifact is idempotent; a conflicting binding or concurrent update fails explicitly instead of silently rebinding media.
- A failed validation remains explicit evidence and cannot satisfy readiness. It never publishes the release.
- Replacing a draft artifact or explicitly abandoning one orphans only the prior draft-bound media. Published or deprecated release artifacts are never orphaned by draft cleanup.
- Download succeeds only for `published` or `deprecated` releases after binding, object metadata, byte checksum, and stored validation evidence agree.
- Public policy permits an anonymous caller; authenticated policy requires an authenticated user decision supplied by the future route.
- Missing objects and checksum mismatches fail closed and return no URL.
- Repair may issue an upload target only for an object that is currently missing. Confirmation accepts only identical bytes with the release's existing checksum. A deterministically invalid replacement is removed; a temporary storage inspection failure retains the object for a safe retry.

## UI States

Not applicable in WP-03. UI ownership starts in WP-07.

## Invariants

- Uploaded content is parsed as data and never executed.
- `HEAD` metadata is not checksum evidence.
- Archive paths must be relative, canonical, slash-separated, and remain inside the archive root.
- Encrypted entries, ZIP64, data-descriptor ambiguity, unsupported compression methods, symlinks, nested archives, duplicate canonical paths, and duplicate root `SKILL.md` entries are rejected.
- Compressed size, per-entry uncompressed size, aggregate uncompressed size, entry count, and path depth are bounded before or during decompression.
- Information, Library, Course, and entitlement ownership are unchanged.
- A published release is immutable; recovery restores identical bytes to its existing media object rather than rebinding it to different content.
- Failure does not create a second storage registry or silently downgrade authenticated access to public access.

## Acceptance Examples

```gherkin
Given a draft Skill release and a confirmed skill-artifact ZIP containing root SKILL.md
When the server validates the object
Then the exact ZIP SHA-256, manifest projection, validation summary, and timestamp are stored
And the artifact prerequisite states are all verified
```

```gherkin
Given a ZIP contains ../outside.txt, a symlink, a nested ZIP, or expands beyond a configured bound
When the server validates the object
Then validation fails with a stable issue code
And the Skill release cannot publish
And no archive content is executed or written to disk
```

```gherkin
Given an authenticated-only published release
When an anonymous caller asks the domain service for a download
Then access is denied and no signed or public storage URL is returned
```

```gherkin
Given a published release's object is missing
When an operator uploads bytes to its repair target
Then repair succeeds only if size, MIME, archive validation, and SHA-256 equal the stored release evidence
And a deterministically invalid replacement is deleted while a temporary inspection failure remains retryable
And download remains unavailable until every prerequisite is verified
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - src/lib/skill-artifacts/archive-validator.test.ts
    - src/lib/storage/local-storage.test.ts
    - src/lib/storage/r2-storage.test.ts
    - src/lib/storage/storage-provider.conformance.ts
  integration:
    - src/lib/__tests__/skill-artifact-service.integration.test.ts
    - src/lib/__tests__/media-assets.integration.test.ts
  contract:
    - src/lib/upload-types.contract.test.ts
  deferred_live:
    - DV-01 in the master plan for production R2 read-back and missing-object repair
```

## Evidence

Tests cover bounded reads, archive validation, upload binding, checksums and exact-byte repair with local storage and mocked R2. The current full-suite results are in [Development and Testing](../development/DEVELOPMENT-AND-TESTING.md). Real R2 credentials, bucket permissions and recovery need a separate deployment test.

## Intentional Changes

- StorageProvider gains a bounded server-side object read operation.
- Media upload/binding enums gain `skill-artifact` and `skillRelease`.
- Skill release rows gain persisted manifest and validation evidence used by WP-03.

## Open Questions

- Production R2 behavior remains deferred to DV-01/WP-10; local and mocked R2 evidence cannot prove live credentials, bucket policy, or provider availability.

Update this contract whenever archive limits, accepted format, persisted evidence, repair semantics, access policy, or storage provider behavior changes.
