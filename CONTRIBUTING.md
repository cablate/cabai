# Contributing to CabAI

Thanks for helping improve CabAI. Bug fixes, clearer setup instructions and small improvements to everyday use are all welcome.

## Find your starting point

Follow [Getting Started](docs/development/GETTING-STARTED.md) to run the sample site. You'll need Node.js `>=22.12 <25`, npm `>=10`, Docker Compose v2 and PostgreSQL.

For a code change, use the [module map](docs/architecture/MODULE-MAP.md) to find the relevant implementation, then read its behavior spec in `docs/contracts/`. [AGENTS.md](AGENTS.md) is a short guide for both people and AI assistants. The [documentation index](docs/README.md) points to the rest; you only need the parts related to your change.

If you change what users see, an API, stored data or generated output, update the relevant behavior spec before implementation. That gives reviewers a clear expected result.

## Keep changes easy to review

- Focus each PR on one outcome and reuse the existing query or service for that feature. Add an abstraction when at least two callers share the same rules.
- Keep schema changes separate from rewrites of checkout, callbacks, subscriptions or access rules. Use a new migration rather than editing one that may already have run.
- Preserve special response handling for callbacks, redirects, streaming, authentication and files; these do not all fit the shared JSON handler.
- Use synthetic data and licensed examples. Keep credentials, customer data, private courses, deployment identifiers and private asset URLs out of the diff.

## Check your change

Start with the closest test, then choose the wider checks it needs:

```bash
npm run verify:static
npm run verify:fast
```

`verify:static` covers lint, types and repository consistency. `verify:fast` adds unit, component and reliability tests. For the full suite and build, use `npm run verify` **after setting up a separate disposable test database** as described in [Development and Testing](docs/development/DEVELOPMENT-AND-TESTING.md). Integration preparation clears test data.

Static verification already includes migration, API-route, OpenAPI and Agent checks. You can also run these individually while working:

```bash
npm run check:migrations
npm run check:api-route-boundaries
npm run openapi:check
npm run check:agent-skill
```

For UI changes, check the affected flow in a browser: keyboard use, mobile layout, loading, empty and error states, and accessibility. In the PR, say what passed and what you could not test.

## Submit a pull request

Explain the problem, your approach and how you checked it. Mention any configuration, data, payment, access or upgrade implications, with recovery steps where relevant. Leave unrelated files and temporary output out of the PR.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions to the project use [Apache-2.0](LICENSE); preserve licenses and attribution for third-party material.

### Updating GitHub Actions

Actions are pinned to full commit SHAs, with version comments for readability. Check the upstream commit and runtime, update the reviewed references in `scripts/check-ci-policy.mjs`, then run `npm run check:ci-policy`.

Workflows use read-only tokens and checkout does not retain credentials. The manual release-evidence job has the additional permissions needed for provenance. Keep those permissions scoped to that job; see [GitHub's security guidance](https://docs.github.com/en/actions/reference/security/secure-use).

## Write for the reader

Use README for an introduction, guides for steps someone can follow, and behavior specs for precise developer rules. Put an operational warning next to the step it affects, with a reason and a safe way forward. Keep test history and release approvals out of product introductions.

README and CHANGELOG have English and Traditional Chinese versions. Update matching sections and run `npm run check:docs`; it checks structure, links and commands. Read both versions for meaning too. Other references can stay in their existing language.

## Prepare a release

Releases come from the shared Git mainline used by self-hosts and the maintainer. Current release work is in [ROADMAP](docs/planning/ROADMAP.md).

1. Choose the reviewed commit and version. Update `package.json`, lockfile metadata and image labels; describe schema, configuration and backup compatibility.
2. Move both CHANGELOG Unreleased sections to the same version/date, add upgrade notes and valid comparison links, then start new Unreleased sections.
3. Run the required checks and get the maintainer's approval to push. Check hosted CI on that exact commit before tagging.
4. Generate bilingual release text with `node tools/docs.mjs release <version>`. Include the tested setup and any upgrade steps; use a pre-release for the initial 0.x release.
5. Confirm the tag and release contents with the maintainer, and verify the private security-reporting channel is available. Keep published tags fixed; ship corrections in a new version.
6. Deploy the maintainer's site from the same commit with its private configuration, after staging, restore checks and separate production approval.

The maintainer chooses the repository destination, reporting channel and publication timing.
