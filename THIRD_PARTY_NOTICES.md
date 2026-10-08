# Content provenance and third-party dependencies

This document distinguishes the project's source license from assets and packages obtained during installation. It is a release-maintenance inventory, not a substitute for the referenced licenses or legal advice. Exact dependency versions and integrity values are in `package-lock.json`; installed package license files remain authoritative for those copies.

## Source content included in this repository

| Paths | Origin and terms | Boundary |
|---|---|---|
| Project application, scripts and documentation | Project source under root Apache-2.0 `LICENSE`, except separately declared material | Do not remove third-party notices in copied/generated code. |
| `fixtures/demo-course/manifest.json` and `lessons/*.md` | Original neutral setup lessons; manifest declares CC0-1.0 and links its terms | Three short setup/navigation/progress lessons, not a production or paid-course export. |
| `fixtures/course-portability/course-export-v1.json` | Synthetic project test metadata, under project license | Dummy asset paths/hashes are a contract fixture, not actual third-party images or PDFs. |
| `public/oss/icon.svg`, `learning.svg`, `social.png` | Original geometric neutral artwork, Apache-2.0; provenance recorded in `public/oss/README.md` | PNG is a rendering of the SVG; no original operator screenshots, faces, logos or paid assets included. |
| `public/site.webmanifest` | Neutral project metadata under project license | Contains only neutral identity and local icon reference. |

Operator uploads, backups, environment files and `public/site/` customization do not belong in the source release. Public branding copied into an image is still redistributed even if Git ignores it; its operator must supply lawful assets. This inventory does not transfer rights to private material or third-party trademarks.

## Dependency terms that need special attention

The repository does not vendor `node_modules` or a prebuilt image. Installation downloads dependencies; serving browser bundles or distributing a built image introduces a different payload and must retain applicable notices. Apache-2.0 applies to this project's source, not automatically to everything installed by npm.

| Locked package family | Declared license / upstream | Release implication |
|---|---|---|
| GSAP 3.15.0 | [GSAP Standard No Charge License](https://gsap.com/standard-license/) | Not Apache/MIT and not an unrestricted open-source license. Current application uses page animations, not a visual animation builder; forks that add such a builder must revisit the vendor's prohibited-use boundary. Preserve proprietary notices. |
| Sentry CLI 2.58.6 and platform executables | [FSL-1.1-MIT](https://github.com/getsentry/sentry-cli/blob/2.58.6/LICENSE) | Source-available restrictions apply before its future-license transition. Redistribution requires the terms/link and existing notices; do not label the CLI Apache-2.0. The Dockerfile copies production dependencies, so optional telemetry being disabled does not prove the CLI absent from an image. |
| sharp 0.35.5 / libvips platform packages 1.3.4 | sharp declares Apache-2.0; native package metadata additionally declares LGPL-3.0-or-later, with some combined terms | Inspect the **target-platform** packages and their included licenses/source requirements before binary redistribution. A Windows inventory cannot certify a Linux image. See [sharp installation/distribution guidance](https://sharp.pixelplumbing.com/install/). |
| Lightning CSS 1.32.0, axe-core and axe Playwright 4.12.1 | MPL-2.0 | Preserve license/source availability for redistributed covered files. Build/test-only usage is not proof a package is absent from the final image; inspect the artifact. See [Mozilla's MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/). |
| Remaining lockfile packages | Predominantly MIT, ISC, Apache-2.0 and BSD, with other permissive/attribution terms | Keep package copyright/license notices. Do not replace a package-level review with the majority license. Platform-optional lock entries need not all be installed on a given host. |

Current source review found no vendored dependency tree or third-party binary payload in Git. This does **not** clear future image/binary redistribution or assert legal compatibility for every possible downstream use. Do not remove functioning dependencies solely to make the license counter look uniform; changes need their own behavior and compatibility review.

## Before distributing a built artifact

1. Build from the exact reviewed commit/lockfile for the intended platform. Inventory actual browser bundles, runtime packages and base-image OS packages, including their versions and license files; a source SBOM alone is insufficient.
2. Retain required copyright/license texts, relevant notices and source-availability information for shipped components. Check native-library source/relinking obligations and restrictions on the intended use with qualified counsel where uncertain.
3. Inspect the final artifact for private runtime state and operator-owned assets. Never package the entire working directory or `.next` quarantine.
4. Record unresolved obligations as a release blocker for that artifact, not as a claim that the source license clears it. The manual release-evidence workflow assists inventory/provenance; it does not perform legal review or authorize publication.

Update this inventory when content, dependency families, bundling or distribution format changes. Source publication, image redistribution and the maintainer's production cutover are separate approval gates in `docs/planning/ROADMAP.md`.
