"use client";
import { useState, useEffect } from "react";
type Data = Record<string, any>;
const paths: Record<string, [string, string][]> = {
  OIDC: [
    ["Issuer", "/oidc"],
    ["Discovery", "/oidc/.well-known/openid-configuration"],
    ["Public signing keys (JWKS)", "/oidc/jwks"],
    ["Authorization", "/oidc/auth"],
    ["Token", "/oidc/token"],
    ["UserInfo", "/oidc/me"],
    ["Introspection", "/oidc/token/introspection"],
    ["Revocation", "/oidc/token/revocation"],
    ["Logout", "/oidc/session/end"],
  ],
  SAML: [
    ["IdP metadata (includes signing certificate)", "/saml/metadata"],
    ["Single sign-on", "/saml/sso"],
    ["Single logout", "/saml/slo"],
  ],
  "WS-Fed": [
    ["Federation metadata (includes signing certificate)", "/wsfed/metadata"],
    ["Passive sign-in / sign-out", "/wsfed"],
  ],
  SCIM: [
    ["Base URL", "/scim"],
    ["Users", "/scim/Users"],
    ["Groups", "/scim/Groups"],
    ["Capabilities", "/scim/ServiceProviderConfig"],
    ["Schemas", "/scim/Schemas"],
    ["Resource types", "/scim/ResourceTypes"],
  ],
};
const fields: Record<string, [string, string, string][]> = {
  OIDC: [
    ["client_id", "Client ID", "text"],
    ["redirect_uris", "Redirect URIs (one per line)", "lines"],
    [
      "post_logout_redirect_uris",
      "Post-logout redirect URIs (one per line)",
      "lines",
    ],
    ["token_endpoint_auth_method", "Client authentication", "auth"],
    ["client_secret", "Client secret (confidential clients)", "password"],
    ["jwks", "Client public JWKS (private_key_jwt)", "json"],
  ],
  SAML: [
    ["id", "Application ID", "text"],
    ["name", "Application name", "text"],
    ["metadata", "Service provider metadata XML", "lines"],
    [
      "requireSignedRequests",
      "Require signed authentication requests",
      "boolean",
    ],
    [
      "encryptAssertions",
      "Encrypt assertions (requires SP encryption certificate)",
      "boolean",
    ],
  ],
  "WS-Fed": [
    ["id", "Application ID", "text"],
    ["name", "Application name", "text"],
    ["realm", "Relying party realm", "text"],
    ["replyUrl", "Reply URL", "text"],
    ["tokenType", "Token format", "token"],
  ],
};
export function ProtocolSettings({
  protocol,
  config,
  connected,
  deployment,
  onSave,
}: {
  protocol: string;
  config: Data;
  connected: boolean;
  deployment: Data | null;
  onSave: (c: Data) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Data>({}),
    [selected, setSelected] = useState(-1),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [clientCredentials, setClientCredentials] = useState(false),
    [refresh, setRefresh] = useState(true);
  const key =
    protocol === "OIDC"
      ? "clients"
      : protocol === "SAML"
        ? "samlApps"
        : "wsfedApps";
  const entries: Data[] = config[key] || [];
  function newDraft() {
    setSelected(-1);
    setDraft(
      protocol === "OIDC"
        ? {
            token_endpoint_auth_method: "none",
            redirect_uris: [],
            post_logout_redirect_uris: [],
          }
        : protocol === "SAML"
          ? { requireSignedRequests: true, encryptAssertions: false }
          : { tokenType: "saml11" },
    );
    setMessage("");
    setRefresh(true);
    setClientCredentials(false);
  }
  useEffect(() => {
    newDraft();
  }, [protocol]);
  function edit(index: number) {
    const c = entries[index];
    setSelected(index);
    setDraft(structuredClone(c));
    setRefresh(c.grant_types?.includes("refresh_token") || false);
    setClientCredentials(
      c.grant_types?.includes("client_credentials") || false,
    );
    setMessage("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const registration = { ...draft };
      if (protocol === "OIDC") {
        registration.grant_types = [
          "authorization_code",
          ...(refresh ? ["refresh_token"] : []),
          ...(clientCredentials ? ["client_credentials"] : []),
        ];
        registration.response_types = ["code"];
        if (!registration.client_secret) delete registration.client_secret;
        if (!registration.jwks) delete registration.jwks;
        else if (typeof registration.jwks === "string")
          registration.jwks = JSON.parse(registration.jwks);
      }
      const next = [...entries];
      if (selected < 0) next.push(registration);
      else next[selected] = registration;
      await onSave({ ...config, [key]: next });
      newDraft();
      setMessage("Application registration saved.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !confirm(
        "Remove this application registration? Existing integrations may stop working.",
      )
    )
      return;
    setBusy(true);
    try {
      await onSave({
        ...config,
        [key]: entries.filter((_, i) => i !== selected),
      });
      newDraft();
      setMessage("Application registration removed.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const base =
    deployment?.origin ||
    (typeof window === "undefined" ? "" : window.location.origin);
  function download(name: string, content: string, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="configuration-grid">
      {protocol === "Deployment" ? (
        <section className="card">
          <h2>Deployment settings</h2>
          <p>
            Secrets and signing keys are configured in Vercel → Settings →
            Environment Variables → Production. Redeploy after changes. Values
            are never displayed here.
          </p>
          {!connected ? (
            <p>
              Connect with your admin token to inspect deployment readiness.
            </p>
          ) : (
            <>
              <p>
                <strong>Configured origin:</strong>{" "}
                {deployment?.origin || "Missing or invalid"}
              </p>
              <p>
                <strong>Storage:</strong> {deployment?.storageMode}
              </p>
              {deployment?.issues?.length ? (
                <div className="note">
                  {deployment.issues.map((s: string) => (
                    <p key={s}>{s}</p>
                  ))}
                </div>
              ) : (
                <p>
                  Required environment settings are present. Test each
                  integration before using it.
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Environment variable</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deployment?.variables?.map((v: Data) => (
                    <tr key={v.name}>
                      <td>
                        <code>{v.name}</code>
                      </td>
                      <td>{v.configured ? "Set" : "Missing"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Production origin: <code>https://www.authnauthz.com</code>.
                Storage mode: <code>blob</code>. Connect a private Blob store.
                Keep the encryption and signing keys stable across
                redeployments.
              </p>
              <a
                href="https://github.com/dushyantgill/authnauthz/blob/main/docs/deployment.md"
                target="_blank"
                rel="noreferrer"
              >
                Deployment and key setup guide ↗
              </a>
            </>
          )}
        </section>
      ) : (
        <>
          <section className="card">
            <h2>{protocol} endpoints</h2>
            <p>
              {protocol === "OIDC"
                ? "Use discovery as the authoritative source for endpoints and capabilities."
                : protocol === "SCIM"
                  ? "Configure your provisioning client with the base URL and the separate SCIM_TOKEN bearer credential from Vercel."
                  : "Import the metadata URL into your relying party to obtain the issuer, endpoints, and signing certificate."}
            </p>
            {(paths[protocol] || []).map(([label, path]) => {
              const url = base + "/api/t/realestate" + path;
              return (
                <div className="endpoint" key={label}>
                  <strong>{label}</strong>
                  <code>{url}</code>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        setMessage(label + " copied.");
                      } catch {
                        setMessage("Copy the endpoint text manually.");
                      }
                    }}
                  >
                    Copy
                  </button>
                  <a href={url} target="_blank" rel="noreferrer">
                    Open ↗
                  </a>
                </div>
              );
            })}
          </section>
          {protocol === "SCIM" ? (
            <section className="card">
              <h2>Provisioning configuration</h2>
              <p>
                Bearer authentication uses <code>SCIM_TOKEN</code>. Set or
                rotate it in Vercel and use the same value in your provisioning
                client. The dashboard reports whether it is set but does not
                expose the secret.
              </p>
              <p>
                Users and Groups support CRUD, filters, pagination, and
                conditional updates. Schema and capability links above advertise
                supported features. Application registrations are not required
                for this tenant-scoped provisioning endpoint.
              </p>
              <p>
                SCIM_TOKEN:{" "}
                {connected
                  ? deployment?.variables?.find(
                      (v: Data) => v.name === "SCIM_TOKEN",
                    )?.configured
                    ? "Set"
                    : "Missing"
                  : "Connect to check"}
              </p>
            </section>
          ) : (
            <>
              <section className="card">
                <h2>
                  {protocol === "OIDC"
                    ? "Public signing keys"
                    : "Signing certificate"}
                </h2>
                {connected ? (
                  protocol === "OIDC" ? (
                    deployment?.jwks ? (
                      <>
                        <pre className="public-material">
                          {JSON.stringify(deployment.jwks, null, 2)}
                        </pre>
                        <button
                          className="secondary"
                          onClick={() =>
                            download(
                              "authnauthz-jwks.json",
                              JSON.stringify(deployment.jwks, null, 2),
                              "application/json",
                            )
                          }
                        >
                          Download public JWKS
                        </button>
                      </>
                    ) : (
                      <p>
                        Set OIDC_JWKS in Vercel to configure the signing key.
                      </p>
                    )
                  ) : deployment?.certificate ? (
                    <>
                      <p>Expires: {deployment.certificate.expires}</p>
                      <p className="fingerprint">
                        SHA-256: {deployment.certificate.fingerprint}
                      </p>
                      <pre className="public-material">
                        {deployment.certificate.pem}
                      </pre>
                      <button
                        className="secondary"
                        onClick={() =>
                          download(
                            "authnauthz-signing-certificate.pem",
                            deployment.certificate.pem,
                          )
                        }
                      >
                        Download certificate
                      </button>
                    </>
                  ) : (
                    <p>
                      Set SAML_CERTIFICATE and its matching SAML_PRIVATE_KEY in
                      Vercel.
                    </p>
                  )
                ) : (
                  <p>
                    Connect with your admin token to view public signing
                    material and configuration status.
                  </p>
                )}
                <p>
                  Private signing keys remain in Vercel. Configure them through
                  the Deployment tab guidance.
                </p>
              </section>
              <section className="card">
                <h2>{protocol} application registrations</h2>
                {!connected ? (
                  <p>
                    Connect with your admin token to add and edit relying
                    parties.
                  </p>
                ) : (
                  <>
                    <div className="toolbar">
                      <select
                        aria-label="Application registration"
                        value={selected}
                        onChange={(e) =>
                          Number(e.target.value) < 0
                            ? newDraft()
                            : edit(Number(e.target.value))
                        }
                      >
                        <option value={-1}>New application</option>
                        {entries.map((c, i) => (
                          <option value={i} key={i}>
                            {c.name || c.client_id || c.id}
                          </option>
                        ))}
                      </select>
                      <span>{entries.length} registered</span>
                    </div>
                    <form className="domain-form" onSubmit={save}>
                      {(fields[protocol] || []).map(([name, label, type]) => (
                        <label key={name}>
                          {label}
                          {type === "boolean" ? (
                            <input
                              type="checkbox"
                              checked={!!draft[name]}
                              onChange={(e) =>
                                setDraft({ ...draft, [name]: e.target.checked })
                              }
                            />
                          ) : type === "auth" || type === "token" ? (
                            <select
                              value={draft[name] || ""}
                              onChange={(e) =>
                                setDraft({ ...draft, [name]: e.target.value })
                              }
                            >
                              {(type === "auth"
                                ? [
                                    "none",
                                    "client_secret_basic",
                                    "client_secret_post",
                                    "private_key_jwt",
                                  ]
                                : ["saml11", "saml20"]
                              ).map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          ) : type === "lines" || type === "json" ? (
                            <textarea
                              rows={name === "metadata" ? 10 : 3}
                              value={
                                type === "json"
                                  ? typeof draft[name] === "string"
                                    ? draft[name]
                                    : draft[name]
                                      ? JSON.stringify(draft[name], null, 2)
                                      : ""
                                  : Array.isArray(draft[name])
                                    ? draft[name].join("\n")
                                    : draft[name] || ""
                              }
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  [name]: name.endsWith("_uris")
                                    ? e.target.value
                                        .split("\n")
                                        .map((s) => s.trim())
                                        .filter(Boolean)
                                    : e.target.value,
                                })
                              }
                            />
                          ) : (
                            <input
                              type={type}
                              value={draft[name] || ""}
                              onChange={(e) =>
                                setDraft({ ...draft, [name]: e.target.value })
                              }
                              required={
                                !["client_secret", "jwks"].includes(name)
                              }
                              autoComplete="off"
                            />
                          )}
                        </label>
                      ))}
                      {protocol === "OIDC" && (
                        <>
                          <label>
                            <input
                              type="checkbox"
                              checked={refresh}
                              onChange={(e) => setRefresh(e.target.checked)}
                            />{" "}
                            Allow refresh tokens (offline_access consent)
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={clientCredentials}
                              onChange={(e) =>
                                setClientCredentials(e.target.checked)
                              }
                            />{" "}
                            Allow client credentials (requires client
                            authentication)
                          </label>
                          <p>
                            Authorization code requires S256 PKCE. Redirect URIs
                            must use HTTPS in deployment. For private_key_jwt,
                            enter the client public JWKS as a JSON object above.
                          </p>
                        </>
                      )}
                      <div className="toolbar">
                        <button disabled={busy}>
                          {busy
                            ? "Saving…"
                            : selected < 0
                              ? "Add application"
                              : "Save application"}
                        </button>
                        {selected >= 0 && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={remove}
                            disabled={busy}
                          >
                            Remove application
                          </button>
                        )}
                      </div>
                    </form>
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}
      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
