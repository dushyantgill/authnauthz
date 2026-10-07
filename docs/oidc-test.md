# OIDC / OAuth browser test

Open Configuration → OIDC → Start test for the selected archetype. The browser test is available at `/api/oidc-test?tenant=realestate`, `biotech` or `insurance`. It uses the automatically managed public client `<tenant>-oidc-test`, an exact same-origin callback, Authorization Code and PKCE S256.

Click Start OIDC / OAuth sign-in, enter an active directory username and the shared simulator password, and approve the requested scopes. The receiver validates its signed browser-state cookie, consumes the server-side pending request once, exchanges the code with its original PKCE verifier, and validates the ID token against the deployment's public signing key. It checks issuer, audience, expiry, required claims, nonce and access-token hash when included. UserInfo must return the same subject. Verified ID-token claims and UserInfo are displayed; raw access tokens and private keys are not displayed or persisted as test results.

Tests expire in ten minutes. A callback cannot be replayed, copied into a different browser or moved to another archetype. Cancelled or failed tests show an error and a fresh-test link. Reloading starts a new test. Responses use no-store headers, a restrictive content security policy and an HttpOnly SameSite cookie.

This tests both OpenID Connect identity authentication and the underlying OAuth authorization-code exchange. It does not claim to test every OAuth grant or external relying-party compatibility. Automated integration tests separately cover refresh, client credentials, introspection and revocation. All three use existing Vercel signing keys, cookie secret and private Blob storage; no additional deployment variables are required.
