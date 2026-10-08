---
schema_version: behavior-contract/v1
id: cabai.plugin-distribution
title: CabAI Plugin distribution boundary
status: active
owner_surface: shared
last_validated: 2026-09-27
---

# CabAI Plugin distribution boundary

CabAI 有一般使用者和管理員兩個 Plugin。這份文件說明如何封裝、安裝與發行，以及兩者使用的 token。Plugin ZIP 是安裝用產物，產品原始碼仍在同一個 Git repo 維護。

## Distribution decision

- `cabai` is distributed as a public downloadable CabAI Skill release. A user downloads the ZIP and installs it in a compatible agent host.
- `cabai-admin` is internal-only. Its ZIP may be supplied directly to an authorized operator; it must not appear in CabAI's public catalog.
- Installation never grants CabAI authority. `cabai` still requires a `cab_user_*` token for `userKey` operations; `cabai-admin` still requires an explicitly scoped `cab_agent_*` token for `agentKey` operations.

This route deliberately does not depend on universal Plugin-directory submission or review. CabAI owns the public artifact, checksum, release lifecycle, and download policy through its existing Skill release and R2 pipeline.

## Package sources

| Package | Portable manifest | Compatibility manifest | Skill | Distribution |
| --- | --- | --- | --- | --- |
| `cabai` | `plugins/cabai/plugin.json` | `plugins/cabai/.codex-plugin/plugin.json` | `plugins/cabai/skills/cabai/SKILL.md` | Public CabAI Skill release |
| `cabai-admin` | `plugins/cabai-admin/plugin.json` | `plugins/cabai-admin/.codex-plugin/plugin.json` | `plugins/cabai-admin/skills/cabai-admin/SKILL.md` | Direct internal download |

Portable and compatibility manifests must keep the same name, version, and description. The source tree remains canonical; generated ZIP files are build outputs and are not committed.

## Download bundle

Run `npm run plugin:package -- cabai` to create `tmp/plugins/cabai-<version>.zip`. The deterministic archive contains:

- `plugin.json` for portable Plugin identity.
- `.codex-plugin/plugin.json` for current Codex compatibility metadata.
- `skills/cabai/SKILL.md` for Plugin Skill discovery.
- Root `SKILL.md`, byte-identical to the nested Skill, so the existing CabAI artifact validator can project metadata and approve the release.

The packager normalizes source text to LF before writing the deterministic ZIP, validates its own output with the production CabAI archive validator, and reports the SHA-256 checksum. This keeps the exact artifact stable across Windows and Linux checkouts. The bundle must contain no Admin Plugin, token, secret, signed URL, private repository URL/data, or environment file.

## Publishing and installation

1. Package and validate `cabai` from the tagged source version.
2. Upload the exact ZIP as a draft public Skill release through the existing Admin Agent artifact flow.
3. Confirm upload, bind it to the release, run readiness, and publish only when checksum and validation evidence agree.
4. Read the published release back through the public API and verify its download target.
5. The user downloads the ZIP and installs or imports it in the chosen compatible agent host. Authentication is configured locally; credentials are never bundled.

Replacing a published archive requires a new immutable Skill release/version. Never overwrite or silently repair it with different bytes.

## Internal Admin installation

Run `npm run plugin:package -- cabai-admin --internal` only for an authorized operator. The required flag makes the private distribution intent explicit; transfer the generated archive through an approved private channel and do not upload it to a public CabAI release. Access to the archive and a scoped Admin token are separate controls; possession of the ZIP alone is not authorization.

## Verification

- `npm run check:agent-skill` validates manifest identity, public/private credential-plane boundaries, and route/OpenAPI parity.
- `npm run plugin:package -- cabai` creates a deterministic archive and validates it against CabAI's production archive rules.
- Publication, public read-back, and download availability are hosted evidence and must not be inferred from committed files.

Update this contract when either Plugin name/version, catalog membership, credential plane, OpenAPI authority, archive layout, access policy, or installation policy changes.
