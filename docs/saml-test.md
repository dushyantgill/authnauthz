# Reusable Real Estate SAML SSO test

Open `https://www.authnauthz.com/api/saml-test` and select **Start SAML SSO**. The launcher generates a fresh HTTP-POST AuthnRequest with an email NameID policy and ForceAuthn. Its request is valid for five minutes; reload to start again. Sign in with an active directory username and the configured shared test password.

The registered test SP uses entity ID `https://www.authnauthz.com/saml-test-sp` and HTTP-POST ACS `https://www.authnauthz.com/api/saml-test`. The dedicated `realestate-saml-test` registration allows unsigned incoming authentication requests; other applications retain their own signature requirements. Returned responses and assertions must be signed by the configured IdP key. Assertion encryption is disabled for this viewer.

The receiver verifies IdP signatures, request correlation through an HttpOnly HMAC-protected cookie, ACS destination, subject recipient, expiry and audience, then uses atomic replay reservation. It displays the signed identity attributes and response XML. Restarting the launcher replaces its pending request cookie; only the latest test in that browser can complete. This is a demonstration receiver hosted beside the IdP, not an independently operated service provider or external conformance certification.

Required deployment signing/cookie/login credentials must be configured before the flow can run. The sample `saml-authn-request.xml` is an inspectable snapshot; use the launcher for fresh timestamps and a matching receiver cookie. The public registration is in `saml-test-registration.json`.

Blob state mutations use the object metadata ETag. When private delivery uses a different ETag, the body read is bracketed by unchanged object metadata before a conditional write; a changed version triggers a fresh read instead of overwriting another writer.
