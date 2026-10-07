# AuthNAuthZ

A configurable enterprise identity simulator built with Next.js, real cryptographic federation flows, and **private Vercel Blob persistence only**. No database, Redis, paid storage add-on, or writable server filesystem is required in deployment.

Choose **Real Estate**, **Biotech / Life Sciences**, or **Insurance** in the sidebar. All three contain 267 synthetic identities (238 employees and 29 embedded vendors), with separate configuration and protocol state. The locked Real Estate model is **267 identities, 238 employees, 29 embedded vendors, nine organizations, 185 groups, and one CEO root**. The directory includes Senior Counsel, Employment & Immigration. Immigration cases, visa categories, and survivor status have no IAM attributes or groups.

The application provides directory search, reporting relationships, organizational views, group memberships, application registration, protocol endpoint discovery, and recent activity. Its protocol engine uses `oidc-provider`, `samlify`, XML schema validation, and verified XML/JWT signatures. The implemented protocol profiles and exclusions are explicit in [the capability matrix](docs/protocols.md). This application has not independently obtained OpenID certification or undergone an external security audit.

## Run locally

Use Node.js 24 and OpenSSL (already available on macOS and GitHub's Ubuntu runners).

```sh
npm ci
npm run setup
npm run dev
```

Open `http://localhost:3000`. `setup` generates separate OIDC and SAML signing keys, a self-signed SAML certificate, an encryption key, admin/SCIM credentials, and a random simulation password. It writes `.env.local` and `.simulation-password`, both excluded from Git. It refuses to overwrite an existing environment. Local memory mode is ephemeral; restarts return to the locked baseline. Connect in the UI using `ADMIN_TOKEN` from `.env.local`. Sign in to relying parties with the generated simulation password from `.simulation-password` and one of the synthetic identities.

For persistence during local development, set `STORAGE_MODE=blob` and provide a **private** Blob store's `BLOB_READ_WRITE_TOKEN`. Private Blob state is additionally encrypted with AES-256-GCM using `STATE_ENCRYPTION_KEY`.

## Deploy on Vercel Hobby

Follow [deployment and configuration](docs/deployment.md). Import this repository as a Next.js project; its root is the repository root. Create one **private Vercel Blob store**, attach it to the project, set the generated environment values, change `APP_URL` to the deployment's stable HTTPS origin, and set `STORAGE_MODE=blob`. No DB is needed. Never deploy memory mode; deployment refuses it.

Built-in SAML and OIDC test registrations are provided automatically. Register your own relying parties through **Configuration** in the authenticated UI. [Examples](docs/config.example.json) show public/confidential OIDC clients and WS-Fed; add SAML SP metadata from your relying party. Redirects, ACS destinations, and WS-Fed reply URLs are registered explicitly. Production registrations require HTTPS.

Hobby is intended for personal, non-commercial testing and has finite storage-operation allowances. A sign-in uses several Blob writes, so the free allowance is a test budget, not a promise of unlimited identity-provider traffic. [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) and [Hobby plan terms](https://vercel.com/docs/plans/hobby) describe current limits.

## Validate

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Tests exercise the live Next.js HTTP routes, OIDC login/consent/PKCE/token/userinfo/refresh/introspection/revocation, registered redirects, SAML SP-initiated sign-in and logout, XML signature verification, encrypted assertions using an independent SP key, signed WS-Fed tokens, SCIM provisioning, directory invariants, encrypted Blob serialization, and atomic replay protection. The default tests use isolated local memory state and a mock of the Blob service's conditional-write contract. They **do not claim to validate a live Vercel store**.

After configuring a real private Blob store, run `npm run test:blob` for a live smoke test. It uses an isolated random validation pathname and deletes that test object afterward; it does not modify the tenant directory. GitHub Actions runs the local validation suite and production build on pushes and pull requests.

## Directory provenance and operation

`data/summit-ridge.json` is the versioned baseline. Its identities come from the uploaded `SampleAADUserData.csv`, with employee/vendor classification preserved and stable UUIDs derived from the source aliases. Organization and role assignments reconstruct the agreed real estate design. Names, aliases, locations, countries, and telephone values are retained; source passwords, force-change flags, and images are excluded. The source file's SHA-256 is recorded for provenance. The uploaded raw CSV is not committed because it contains password fields.

`python3 scripts/import-directory.py /path/to/SampleAADUserData.csv` deterministically recreates the baseline and asserts locked population/group counts. The importer treats its source as read-only. SCIM writes modify a persisted runtime copy; they do not rewrite the Git baseline. An authenticated reset restores the baseline and invalidates sessions/tokens while retaining application configuration.

See [architecture and security](docs/architecture.md), [protocol capabilities](docs/protocols.md), and [deployment](docs/deployment.md) for endpoint contracts, key handling, concurrency, reset behavior, limits, and troubleshooting.

## Archetypes and browser tests

Select Real Estate, Biotech / Life Sciences, or Insurance in the sidebar. Each has 267 identities (238 employees and 29 embedded vendors) and an independent directory and configuration. Real Estate retains its locked 185 groups; the other two have 213 groups each. See [organization and group design](docs/archetypes.md).

Configuration → OIDC links to a browser Authorization Code + PKCE test that verifies the ID token and UserInfo. Configuration → SAML links to a signed response test. Both work with the selected archetype. Sign-in branding follows its configured employee domain, with archetype-specific colors and symbols.
