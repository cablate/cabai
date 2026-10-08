# CabAI — your own course and member website
[繁體中文](README.zh-TW.md)

![CabAI — knowledge for people and AI](design/banner/banner-desktop.png)

CabAI is a self-hosted course and member website for creators who want to publish their teaching materials and manage their own audience.

Write courses in the admin area, organize them into chapters, and give visitors a preview while keeping full lessons available to members with access. Learners can find their courses and pick up where they left off. You manage the content and who can read it in the same place.

You control the site's identity, teaching materials, member data and service accounts. An Agent API also lets AI assistants help manage content instead of doing everything through the admin interface.

## What can you use it for?

- **Turn teaching materials into courses.** Organize chapters and lessons, with separate drafts, published content and previews.
- **Give members a place to learn.** Learners can find their courses, read lessons and track completion.
- **Choose who can access each course.** Manage member access while keeping public previews and member-only content on the same site.
- **Connect services as you need them.** Add payments, email or Discord after getting the course site running.

For example, start with a short three-lesson course. Make the first lesson a public preview and give members access to the full course. You don't need to set up payments or email to try this out.

## Try it on your computer

The project includes a sample course with **2 chapters and 3 lessons**. Explore the learner pages, then try editing the content in the admin area.

You'll need Node.js 22, npm, Docker and Git. Follow [Getting Started](docs/development/GETTING-STARTED.md) to configure the app, start the database and load the sample course. Once it's running, open `http://localhost:3000` to see the course and preview pages.

You don't need external service accounts to view the sample. A separate setup flow creates your first administrator; add your own Google login credentials when you're ready for learners to sign in. Use a new database for the sample, separate from real member data.

Ready to put it on your domain? Follow [Deployment and Operations](docs/operations/DEPLOYMENT-AND-OPERATIONS.md). The guide starts with one Linux host, PostgreSQL and local file storage, and covers HTTPS, backup, restore and upgrades. You pay for your own hosting, domain and any services you choose to connect.

## Ask your AI to help set it up

Give the repo link to an AI assistant that can read files and run commands, along with this request:

> Help me set up CabAI. Read README.md and AGENTS.md first, then follow the project documentation. Ask whether I want to try it on my computer or deploy it to a host. Check my environment and explain which accounts and settings I need. Use my own service accounts and keep secrets in local configuration files. Ask before changing existing data, using paid services or touching a live website. When you're done, help me check the site, login and course access, and explain how to back up, restore and upgrade it. List anything you haven't tested yet.

[AGENTS.md](AGENTS.md) gives your assistant directions to the configuration, code, tests and deployment guides. You don't have to understand the whole codebase first: the assistant can follow the docs and ask you for host access or account settings when needed.

## Use it, improve it, share the improvements

The project follows a **dogfooding** approach: the maintainer's own installation and everyone else's share the same product code, with fixes coming back to this repo. Branding, accounts and private data live in each installation's configuration, so improvements can benefit everyone. See [PRINCIPLES](PRINCIPLES.md) for the full approach.

The app uses Next.js, TypeScript and PostgreSQL. To change the interface, extend a feature or connect your own tools, start with the [module map](docs/architecture/MODULE-MAP.md) and [contribution guide](CONTRIBUTING.md). For running tests, see [Development and Testing](docs/development/DEVELOPMENT-AND-TESTING.md).

The first public release is in preparation. Course publishing and member reading are the main workflows; local build, browser and backup/restore tests have passed. Before using it with real members, walk through login and course access on your own installation and test the external services you enable. Next improvements will focus on setup and everyday usability; see the [ROADMAP](docs/planning/ROADMAP.md).

## When you need more detail

- **Change the site name, login or connected services:** [Configuration](docs/development/CONFIGURATION.md).
- **Trouble starting the app or signing in:** [Troubleshooting](docs/operations/TROUBLESHOOTING.md).
- **Upgrade an existing installation:** [Changelog](CHANGELOG.md). The legacy Marketplace callback is currently disabled; existing users should read the upgrade notes first.
- **Report a security issue:** follow the private [security reporting instructions](SECURITY.md) rather than posting vulnerabilities or account details in a public issue.

## License

The code is licensed under [Apache-2.0](LICENSE), which allows use, modification and redistribution under its terms. The sample course uses [CC0-1.0](fixtures/demo-course/manifest.json). Third-party package and asset licenses are listed in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).
