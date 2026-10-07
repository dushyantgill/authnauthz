import { origin, type TenantConfig } from "./config";
import { testMetadata } from "./saml-test";
export function testClientId(t: string) {
  return t + "-oidc-test";
}
export function testCallback(t: string) {
  return origin() + "/api/oidc-test?tenant=" + t + "&callback=1";
}
export function withTestClients(config: TenantConfig, t: string): TenantConfig {
  return {
    ...config,
    clients: [
      ...config.clients.filter((c) => c.client_id !== testClientId(t)),
      {
        client_id: testClientId(t),
        redirect_uris: [testCallback(t)],
        post_logout_redirect_uris: [],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    ],
    samlApps: [
      ...config.samlApps.filter((a) => a.id !== t + "-saml-test"),
      {
        id: t + "-saml-test",
        name: "Built-in SAML test",
        metadata: testMetadata(t),
        requireSignedRequests: false,
        encryptAssertions: false,
      },
    ],
  };
}
