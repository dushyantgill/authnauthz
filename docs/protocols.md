# Protocol capability matrix

This simulator implements the following enterprise integration profiles. “Support” refers to these configured, advertised surfaces; optional profiles and historical extensions outside this table are not implied. Protocol discovery and SCIM capability documents are authoritative for the running configuration. Local automated tests do not substitute for external conformance certification or testing your specific relying party.

## OpenID Connect 1.0 / OAuth 2.0

Implemented with the maintained [oidc-provider](https://github.com/panva/node-oidc-provider) engine. The engine has OpenID certification; this wrapper/application has not separately been certified.

| Capability                             | Behavior                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OIDC discovery / OAuth server metadata | Tenant issuer, authoritative endpoints, capabilities                                                                                                                                   |
| Public JWKS                            | Stable RSA signing key, no private key components                                                                                                                                      |
| Authorization code                     | Exact registered redirect, login, consent, state/nonce, one-time code; code-only response type                                                                                         |
| PKCE                                   | Required S256 for all authorization-code clients                                                                                                                                       |
| ID tokens                              | RS256, issuer/audience/expiry/authentication context/nonce via the provider                                                                                                            |
| Userinfo                               | Bearer access token; scoped profile/email/group claims; active accounts only                                                                                                           |
| Refresh tokens                         | Offline consent, rotation, replay rejection and grant-family revocation                                                                                                                |
| Client credentials                     | Authenticated clients; opaque access tokens, no end-user ID token                                                                                                                      |
| Client authentication                  | None for public clients; client_secret_basic, client_secret_post, private_key_jwt with inline public JWKS                                                                              |
| Introspection / revocation             | Authenticated protocol endpoints, actual persistent token state                                                                                                                        |
| RP-initiated logout                    | Registered return URI, provider CSRF confirmation, session/grant invalidation and simulator session clearing                                                                           |
| PAR / DPoP                             | Maintained provider's default enabled profiles; shared persistent replay model. Discovery reports their supported endpoints/algorithms                                                 |
| Response modes                         | Provider's query, fragment, and form_post modes for the code response                                                                                                                  |
| Disabled profiles                      | Implicit/hybrid token issuance, password grant, public dynamic registration, device/CIBA/FAPI, mTLS, request objects/JAR and OIDC token encryption are not enabled by this application |

Access-token and client-credentials lifetime: 15 minutes. Authorization codes: 60 seconds. ID tokens: 15 minutes. Refresh tokens/grants: one day. Sessions: one hour. Interactions: five minutes. OAuth 2.x does not mean every extension in every OAuth RFC or a claim to implement all OAuth 2.1 draft features. Security choices follow the authorization-code/PKCE recommendations in [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).

## SAML 2.0

Implemented with [samlify](https://samlify.js.org/) and XML schema/signature validation. The application is an **IdP**, with registered relying-party SP metadata.

| Capability                   | Behavior                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IdP metadata                 | Signed EntityDescriptor with signing certificate, Redirect/POST SSO/SLO endpoints and supported NameID formats                                                               |
| SP-initiated browser SSO     | Redirect or POST AuthnRequest; HTTP-POST Response                                                                                                                            |
| Request trust                | Registered issuer/certificate, RSA-SHA256 signatures, XML schema validation, root-bound POST signature references, no DTD/entities/duplicate IDs, bounded XML/inflation      |
| Request validation           | Version, Destination, freshness, unique ID, exact registered ACS URL or index, response binding, NameID policy and available authentication context                          |
| Assertion / response signing | Both assertion and outer response signed with RSA-SHA256 and SHA-256 digests                                                                                                 |
| Assertion encryption         | Optional AES-256-GCM with RSA-OAEP SP key wrapping; signed assertion encrypted then outer response signed                                                                    |
| Claims                       | Email/name/givenName/surname/groups, selected NameID, bearer confirmation, ACS recipient, audience, validity windows, AuthnInstant and random SessionIndex                   |
| NameID                       | Persistent, emailAddress, transient                                                                                                                                          |
| ForceAuthn / IsPassive       | Forced reauthentication; passive sign-in uses an existing active simulator session or returns signed NoPassive                                                               |
| Protocol error statuses      | Signed InvalidNameIDPolicy/NoAuthnContext/NoPassive after trust/ACS validation; malformed, untrusted or replayed requests receive HTTP errors                                |
| SP-initiated SLO             | Signed Redirect/POST LogoutRequest, issued NameID/SessionIndex matching, local session/token revocation, signed LogoutResponse                                               |
| Outside this profile         | Artifact/SOAP bindings, ECP, unsolicited IdP-initiated SSO, assertion/query services, NameID management, multi-party logout fan-out, and encrypted NameID are not advertised |

Assertions are valid for five minutes, with a one-minute NotBefore clock allowance. Request age tolerance is five minutes; request IDs are reserved for ten minutes. RelayState is preserved and limited to 80 bytes. RequestedAuthnContext supports the available PasswordProtectedTransport class; no stronger authentication method is falsely claimed. Authentication sessions last one hour. Certificate renewal/rollover must be coordinated with SP trust configuration; automatic overlapping SAML signing-certificate rollover is not implemented.

## SCIM 2.0

[SCIM core schema (RFC 7643)](https://www.rfc-editor.org/rfc/rfc7643.html) and [protocol (RFC 7644)](https://www.rfc-editor.org/rfc/rfc7644.html), with explicit ServiceProviderConfig. Both Users and Groups are persistent runtime resources, including the enterprise User extension.

| Capability                     | Behavior                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery                      | ServiceProviderConfig, Schemas, ResourceTypes; SCIM response media type and error schemas                                                                    |
| Users/Groups                   | GET list/detail, POST create, PUT replace, PATCH update, DELETE                                                                                              |
| Search                         | Collection filters and POST Users/.search or Groups/.search                                                                                                  |
| Filter syntax                  | Attribute/subattribute paths, value-path filters, eq/ne/co/sw/ew/pr/gt/ge/lt/le, and/or/not/parentheses                                                      |
| Pagination and sorting         | totalResults, startIndex, count (including zero), itemsPerPage; sortBy/sortOrder                                                                             |
| Projection                     | attributes or excludedAttributes; always includes id and schemas                                                                                             |
| PATCH                          | add/replace/remove, complex and multi-valued attributes, filtered paths, subattributes; atomic whole-request persistence                                     |
| Resource versions              | Weak ETag resource versions, If-Match conflict rejection, If-None-Match detail reads                                                                         |
| Memberships                    | Valid referenced users/groups, direct and nested group expansion, readonly User.groups                                                                       |
| Integrity                      | Case-insensitive username uniqueness, required attributes/types, manager/member references, cycle checks, no prototype paths or unknown sensitive extensions |
| Disabled optional capabilities | Bulk and password-change operations explicitly report supported=false; global cross-resource /.search is not implemented                                     |

SCIM can change the active runtime directory (including its counts) as part of a provisioning test. Git's baseline remains exactly 267 identities / 185 groups and can be restored by the authenticated reset API. Unknown attributes/schemas are rejected, so sensitive case fields cannot be added accidentally.

## WS-Federation 1.2 passive profile

Based on [OASIS WS-Federation 1.2](https://docs.oasis-open.org/wsfed/federation/v1.2/ws-federation.html) and [Microsoft's passive request profile](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-mwbf/54759c9b-4298-44f7-9026-f5ee815594d8).

| Capability           | Behavior                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Federation metadata  | Signed SecurityTokenServiceType descriptor, signing certificate, token types, passive endpoint                                                                                           |
| wsignin1.0           | Registered realm and reply URL; login session or fresh authentication                                                                                                                    |
| Passive response     | POST wa=wsignin1.0, wresult WS-Trust RSTR, echoed wctx                                                                                                                                   |
| Tokens               | Per-application signed SAML 1.1 or SAML 2.0 assertion; audience, lifetime, authentication statement, name/email/group claims                                                             |
| Freshness            | wfresh=0 forces authentication; positive minute values bound session freshness                                                                                                           |
| Sign-out             | wsignout1.0 / wsignoutcleanup1.0 revoke local simulator sessions; return URLs must be registered                                                                                         |
| Outside this profile | Active SOAP WS-Trust, home-realm discovery, WS-Fed request/policy XML extensions, stronger authentication classes, token encryption, and coordinated remote sign-out are not implemented |

A SAML 1.1 assertion issued by WS-Fed is **not** a separate claim of SAML 1.1 browser SSO support.

## Personas

`generic`, `okta`, `entra`, and `adfs` are simulation configuration choices, not replicas of those commercial services. Generic/Okta-style group claims contain display names. The Entra persona uses stable group IDs and adds `oid`, `tid`, and `upn` profile claims. AD FS-style integration is available through the WS-Fed profile, which uses Microsoft-compatible claim URIs and SAML 1.1 by default. Protocol issuer URLs remain this simulator's own URLs, and all personas use the same validated standards engine. Application-specific integration testing is still needed.
