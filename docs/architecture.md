# Architecture and security

## Tenant and directory

Three fixed archetypes are enabled: `realestate`, `biotech`, and `insurance`. Each has a separate directory, application configuration, protocol issuer, Blob pathname, replay/CSRF state and OIDC cookies. Browser SSO checks the tenant before reusing a session. Unknown tenants are rejected. All three use the deployment's signing keys and encryption key; issuer and audience validation distinguish their tokens. `ADMIN_TOKEN` and `SCIM_TOKEN` authorize all three tenants in this synthetic simulator, rather than representing separate tenant administrators. Additional archetypes cannot be created through the UI.

The locked baseline is a sanitized, deterministic projection of SampleAADUserData.csv and the accepted nine-organization real estate design. Its source SHA-256 supports provenance without publishing the raw password-bearing CSV. Stable user/group IDs, exact employee/vendor counts, one CEO root, acyclic manager relationships, valid memberships and absence of sensitive fields are tested. Vendors use a distinct external domain and report to accountable working managers.

The UI's unconnected view is a public synthetic baseline preview. Admin authentication is required for live state, event history and configuration. The preview contains synthetic directory information by design. Do not replace it with a real workforce dataset without redesigning access control and data handling.

## Blob state and concurrency

The persisted object is one tenant-scoped, private, AES-256-GCM-encrypted JSON state snapshot. It contains configuration, SCIM resources, protocol models, session/replay/rate/CSRF state and a bounded event log. Encryption uses a fresh nonce per write and authenticates each snapshot. Keys and privileged tokens stay in server environment variables and never enter the browser baseline bundle.

Reads use `get(..., { access: 'private', useCache: false })` to fetch current origin content. Writes use the stable object ETag from metadata bracketing that read with `put(..., { ifMatch: etag, allowOverwrite: true })`. Creation uses an exact pathname with overwrite disabled. An ETag conflict retries the entire pure mutation against a fresh snapshot (up to five attempts). Missing state initializes from the baseline; failures, corruption and quota errors never initialize replacement state. There is no deployment memory fallback.

This lets each mutation atomically check and consume an authorization code, reserve a replay identifier, remove a CSRF nonce, or replace a SCIM resource. Parallel consumers cannot both successfully commit the same one-time operation. OIDC model `consume`, grant revocation and replay insertion use that shared store. Whole-tenant updates prevent cross-resource SCIM uniqueness/member races. Token issuance is a sequence of safe model mutations rather than a global distributed transaction: if storage fails after consuming a credential, the flow fails closed and the user begins again. No local process mutex is treated as a cross-instance guarantee.

[Vercel documents conditional writes](https://vercel.com/docs/vercel-blob#conditional-writes) and [private origin reads](https://vercel.com/docs/vercel-blob/using-blob-sdk). Default tests verify the SDK adapter against a simulated ETag contract. `npm run test:blob` separately checks a live store once credentials are supplied. Live deployment/latency/quota behavior cannot be established by the local mock suite alone.

A single snapshot intentionally trades throughput for simple, auditable concurrency at hobby simulator volumes. It is not a scalable commercial identity backend. Expired models are pruned during successful mutations; activity retains 100 events. Whole-snapshot writes consume Blob allowances and transfer bytes; monitor operations, contention and object growth.

## Authentication and federation

Simulation login deliberately lets a tester select a synthetic person and use a generated shared simulation password. The password is salted/scrypt-hashed; the source CSV's passwords are discarded. This is appropriate for choosing test personas and is not authentication for actual employees. Admin, SCIM and simulation credentials are separate. Login forms have expiring, one-time CSRF tokens, exact Origin checks and a shared per-originated-address attempt limit. Browser sessions use signed HttpOnly cookies and revocable server state.

OIDC security behavior is delegated to the maintained provider: redirect registration, consent, code/PKCE/nonce binding, token lifetime, client authentication, JWT signatures, introspection, refresh rotation, reuse detection and logout. The adapter adds atomic model consumption and replay insertion. Provider caching is keyed by client/persona configuration, not by ephemeral instance state. All instances read the same persistent protocol models.

SAML metadata is administrator-supplied XML, parsed without DTDs/entities. AuthnRequests are schema-validated and cryptographically checked against registered SP keys. Root-bound signature references, duplicate-ID rejection, bounded decompression, request freshness/IDs, exact issuer/Destination/ACS validation and registered NameID policy prevent request substitution/replay. Both assertions and responses are signed; optional assertion encryption uses the SP's independent public key. Issued NameID/SessionIndex records support signed SP logout. WS-Fed enforces registered realms/replies and signs audience/lifetime-bounded assertions.

Secret/key material is generated locally and excluded from Git. Environment values are required rather than falling back to development defaults in deployment. PEM/JSON credentials are not exposed by protocol metadata/JWKS; those endpoints expose public verification material only. Request Host headers do not choose issuers. HTML/XML interpolation is escaped and federation form scripts use a CSP nonce.

## Operational boundaries

No external security audit, customer-vendor compatibility certification, real Blob deployment test or Vercel deployment is implied by passing the local suite. Test the supplied profile with each actual relying party. A particular enterprise app may require an optional feature not enabled here; consult the capability matrix rather than interpreting “SAML/OIDC/SCIM/WS-Fed support” as every possible standards extension.

Use dedicated synthetic test applications and credentials. Rotate tokens/keys deliberately and back up state/encryption keys. Keep preview/prod stores separate. Provisioning tests can modify runtime identities, but reset always restores the immutable archetype. Blob unavailability, quota exhaustion and repeated contention produce errors; they do not silently weaken replay protection or move to memory.

## Directory presentation upgrades

The CSV contains 267 JPEG thumbnails. Currently 81 are published as static profile assets; 186 remain extracted locally and await an efficient authenticated Git transfer. `public/photos/status.json` records this partial publication. Each seed and live SCIM User references its thumbnail with the standard `photos` attribute; all three archetypes share the supplied synthetic portraits. Custom SCIM photo values are retained, and failed images fall back to initials. The supplied photos are public assets, published with user approval.

Existing Real Estate `MGR-<manager UUID>` labels migrate to `TEAM-<MANAGER-NAME>-DIRECT-REPORTS`, while group UUIDs, membership, workforce counts, configured domains and registrations remain unchanged. Migration persists through the Blob conditional-write path and updates resource metadata. Deliberately renamed groups are retained. The immutable Real Estate population remains 267 identities and 185 groups.
