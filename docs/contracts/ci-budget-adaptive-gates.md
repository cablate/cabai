---
schema_version: behavior-contract/v1
id: infrastructure.ci-budget-adaptive-gates
title: Adaptive GitHub Actions CI gates
status: active
owner_surface: infrastructure
change_context:
  type: refactor
  reason: Preserve high-risk pull-request verification while avoiding full container and integration work for allowlisted documentation or agent-skill changes.
  non_goals:
    - Remove Gitleaks, static verification, tests, E2E, migration checks, build, smoke, or container checks for paths that require them.
    - Reintroduce an automatic push-triggered duplicate after a verified pull request is merged.
    - Change product behavior, deployment behavior, database schema, or release-evidence semantics.
    - Treat an unknown path or scope-detection failure as low risk.
---

# Adaptive GitHub Actions CI Gates

CI chooses checks from the changed files: every PR gets static and secret checks; application changes also run tests and builds; server and deployment changes add container checks. Unknown paths and manual runs use the full set.

## Change Context

The first CI budget pass removed the duplicate full run after a pull request was
merged. This pass keeps the existing `verify` check name but makes its expensive
steps conditional on the changed paths. The scope classifier fails closed: an
unknown path, an empty file list, manual dispatch, or a detection failure keeps
the full safety path enabled.

## Behavior Boundary

In scope:

- Every pull request still runs Gitleaks, dependency installation, and
  `npm run verify:static`.
- Changes limited to `docs/`, `plans/`, `.claude/`, `.agents/`, or root Markdown
  files use the static gate without PostgreSQL, E2E, migration matrix, build, or
  smoke work.
- Runtime or build changes retain the complete `verify` path.
- Changes touching API/server libraries, migrations, deployment scripts,
  Docker/Compose files, dependencies, or CI configuration also run `container`.
- `workflow_dispatch` always runs the complete `verify` and `container` gates.

Out of scope:

- Changing the application, database, deployment, or user-facing runtime.
- Adding a second full workflow or an unreviewed third-party path-filter action.
- Making a path classification decision from a partial or failed file list.

## Consumers And Entrypoints

- Workflow: `.github/workflows/ci.yml`.
- Classifier: `scripts/classify-ci-scope.mjs`.
- Classifier tests: `scripts/classify-ci-scope.test.mjs`.
- Static policy: `scripts/check-ci-policy.mjs`.
- Package commands: `npm run check:ci-scope` and `npm run verify:static`.
- Pull-request reviewers who rely on the `verify` and `container` checks.
- Operators who use the manual `workflow_dispatch` recovery path.

## Inputs And State

- For pull requests, the scope job reads the changed file list through the
  GitHub pull-request API.
- For manual dispatch, the classifier receives a forced-full marker.
- The classifier has no database, product secret, or production dependency.
- The `scope` job exposes `full` and `container` outputs to the existing jobs.

## Outputs And Side Effects

- Low-risk pull requests still produce one named `verify` result, but expensive
  steps are reported as skipped inside that job.
- Container verification is skipped only when the classifier confirms that no
  container-sensitive path changed.
- A failed scope job causes both safety paths to run rather than silently
  reducing coverage.
- No production service, database, external provider, or release artifact is
  changed by this workflow decision.

## Cache And Execution Efficiency

- `setup-node` retains the repository's npm dependency cache. CI and image
  installs continue to use the repository's canonical `npm ci` commands; cache
  work does not alter dependency audit or installation behavior.
- The Next.js cache key is based on dependency and build configuration inputs,
  including PostCSS, not `src/**/*`. Next.js and TypeScript still validate
  source file versions during the existing build and typecheck; changing
  application code therefore cannot turn a stale cache into a passing result.
- Next.js and Docker caches use explicit restore/save actions. A newly populated
  cache is saved immediately after its corresponding build succeeds, so a later
  smoke or boundary failure does not force the next run to start cold.
- The container job restores a local BuildKit cache and exports a new `mode=max`
  cache only when the primary key was not an exact hit. A failed image build
  leaves the previously restored cache in place.
- The container job initializes `docker/setup-buildx-action@v4` before cache
  restore. Its `docker-container` builder supports the local cache export used
  here; the runner's default Docker driver does not.
- The Docker cache key covers image-build inputs (`Dockerfile`, ignore rules,
  and package manifests). BuildKit still hashes the full build context when
  deciding whether individual source layers are reusable.
- A cache miss only makes the build colder; it never skips image boundary,
  migration, or smoke verification. Cache restoration and promotion are not
  correctness gates.
- Verify and container jobs publish exact-hit status, cache size, export status,
  and Docker build duration to the GitHub Actions step summary. Restore/save
  durations remain visible as individual steps.
- `mode=max` is a measured experiment, not a permanent invariant. Keep it only
  if a warm rerun reduces total job time after restore/save overhead; otherwise
  change the export mode or remove the layer cache.
- Existing historical cache entries are not deleted by CI. Cleanup is an
  operational storage task and should be performed deliberately after the new
  keys have been observed in GitHub's cache inventory.

## Production Build Ownership

- `scope.container=false`: `verify` owns `npm run build`, Next.js cache save,
  and the production-server smoke test.
- `scope.container=true`: `container` owns the production build through the
  Dockerfile and runs the shared `scripts/smoke-test.ts` against the built
  image after seeding the isolated Compose database.
- Scope failure is fail-closed: `container` runs and owns the production build;
  CI cannot pass without a successful image build and smoke test.
- Unit, component, contract, integration, reliability, browser, migration, and
  static gates remain in `verify`; only equivalent production build work moves.
- The container smoke mounts the existing seed and smoke scripts read-only into
  one-off CI containers. These utilities are not added to the production image.

## Invariants

- `pull_request` and `workflow_dispatch` remain available; automatic `push`
  duplication remains disabled.
- Concurrency cancels superseded runs for the same workflow/ref.
- Every unknown path is treated as full verification.
- API, server, migration, deployment, dependency, and CI changes retain the
  container boundary gate.
- Every full-verification path has exactly one production build owner. The
  policy guard rejects workflows that let Verify and Container both own it.
- Agent-skill and documentation changes still run the static checks that can
  validate their repository contracts.
- The manual workflow remains a complete recovery path after merge or during an
  incident.

## Acceptance Examples

```gherkin
Given a pull request changes only docs/contracts/ci.md
When the CI workflow runs
Then verify runs Gitleaks, npm ci, and verify:static
And PostgreSQL, E2E, migration matrix, build, smoke, and container steps are skipped
```

```gherkin
Given a pull request changes src/app/(public)/page.tsx
When the CI workflow runs
Then verify runs the complete test, E2E, migration, build, and smoke path
And container is not required for a public UI-only change
```

```gherkin
Given a pull request changes src/app/api/agent/public/v1/library/route.ts
When the CI workflow runs
Then verify runs the complete path
And container runs its production boundary checks
```

```gherkin
Given the changed-file API or classifier cannot determine scope
When the CI workflow runs
Then the scope result is treated as full and container-sensitive
```

## Test Mapping

```yaml
test_mapping:
  unit:
    - scripts/classify-ci-scope.test.mjs
  static:
    - npm run check:ci-scope
    - npm run check:ci-policy
    - npm run verify:static
  workflow:
    - Pull request with documentation-only changes
    - Pull request with public UI-only changes
    - Pull request with API or migration changes
    - Manual workflow_dispatch
  manual:
    - Confirm the GitHub Actions summary reports the expected scope.
    - Confirm a skipped container job does not block the pull request.
    - Compare one cold container run with one warm rerun on the same pull request.
    - Record restore, build, save, and total job duration before retaining mode=max.
```

## Evidence

The classifier tests cover documentation-only, UI, server and unknown-path changes. The policy tests check triggers, required jobs and permissions. To evaluate caching, compare cold and warm runs on your own repository; local tests do not measure hosted build time.

## Intentional Changes

- Documentation, plans, local agent-skill files, and root Markdown no longer
  trigger the database/E2E/build/container portion of `verify`.
- Public UI changes still receive full application verification but may skip the
  separate container boundary job.
- API, server, migration, deployment, dependency, and workflow changes retain
  both full jobs.
- Container builds retain the same Dockerfile and boundary checks while using a
  reusable local BuildKit layer cache.

## Rollback

Revert the adaptive-gate commit. The prior PR-only full `verify` and `container`
workflow remains the safe fallback; no data migration or deployment rollback is
required.

## Maintenance

Update `scripts/classify-ci-scope.mjs` and its tests whenever a new runtime,
deployment, database, or CI-sensitive directory is introduced. Unknown paths
must remain full until their safety classification is reviewed.
