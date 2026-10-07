"use client";
import { useState, useEffect, useMemo } from "react";
import baseline from "../data/summit-ridge.json";
type RecordData = Record<string, any>;
const sections = [
  "Overview",
  "Directory",
  "Groups",
  "Organization",
  "Applications",
  "Protocol endpoints",
  "Activity",
];
export default function Home() {
  const [section, setSection] = useState("Overview"),
    [token, setToken] = useState(""),
    [connected, setConnected] = useState(false),
    [directory, setDirectory] = useState<RecordData | null>(null),
    [config, setConfig] = useState(""),
    [query, setQuery] = useState(""),
    [org, setOrg] = useState("All organizations"),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<RecordData | null>(null),
    [busy, setBusy] = useState(false);
  const users = directory?.users || baseline.users,
    groups = directory?.groups || baseline.groups;
  async function request(url: string, options: RequestInit = {}) {
    const r = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    const text = await r.text();
    let b;
    try {
      b = JSON.parse(text);
    } catch {
      throw Error(
        `The server returned an unexpected response (HTTP ${r.status}). Check the deployment configuration and Vercel logs.`,
      );
    }
    if (!r.ok)
      throw Error(
        typeof b.error === "string" ? b.error : JSON.stringify(b.error),
      );
    return b;
  }
  async function connect() {
    setBusy(true);
    try {
      const [d, c] = await Promise.all([
        request("/api/admin/directory"),
        request("/api/admin/config"),
      ]);
      setDirectory(d);
      setConfig(JSON.stringify(c, null, 2));
      setConnected(true);
      setMessage("Connected to live simulator state.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await request("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify(JSON.parse(config)),
      });
      setMessage(
        "Configuration saved. New requests use these application registrations.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setQuery("");
    setSelected(null);
  }, [section]);
  const filtered = useMemo(
    () =>
      users.filter((u: RecordData) => {
        const organization =
          u.organization ||
          u["urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"]
            ?.organization;
        return (
          (org === "All organizations" || organization === org) &&
          [u.displayName, u.userName, u.title, organization]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())
        );
      }),
    [users, org, query],
  );
  const counts = {
    employees: users.filter((u: RecordData) => u.userType === "Employee")
      .length,
    vendors: users.filter((u: RecordData) => u.userType === "Contractor")
      .length,
  };
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          a<span>AuthNAuthZ</span>
        </a>
        <div className="tenant">
          <span className="avatar">SR</span>
          <div>
            <strong>Summit Ridge</strong>
            <small>Properties · Real Estate</small>
          </div>
          <span className="dot" />
        </div>
        <div className="navlabel">IDENTITY WORKSPACE</div>
        <nav>
          {sections.map((s, i) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={section === s ? "active" : ""}
            >
              <span>{["◈", "♙", "⊞", "⑂", "▣", "⌘", "◷"][i]}</span>
              {s}
            </button>
          ))}
        </nav>
        <div className="sidebarfoot">
          <span className="dot" />{" "}
          {connected ? "Live state connected" : "Reference directory"}
          <small>
            Enterprise identity simulator
            <br />
            Real Estate archetype · v1
          </small>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Workspace <b>/</b> {section}
          </span>
          <div className="badge">
            {connected ? "● LIVE STATE" : "◇ BASELINE PREVIEW"}
          </div>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <div className="eyebrow">SUMMIT RIDGE PROPERTIES</div>
              <h1>
                {section === "Overview"
                  ? "Your enterprise, connected."
                  : section}
              </h1>
              <p>
                {section === "Overview"
                  ? "One coherent organization. Every identity, relationship, and integration in view."
                  : "Explore and configure your enterprise identity simulation."}
              </p>
            </div>
            {connected && (
              <button onClick={connect} className="secondary" disabled={busy}>
                Refresh state ↻
              </button>
            )}
          </div>
          {!connected && (
            <div className="connect">
              <div>
                <strong>Open your simulation workspace</strong>
                <p>
                  The reference directory is available below. Enter your admin
                  token to configure applications and inspect live state.
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  connect();
                }}
              >
                <label className="sr-only" htmlFor="admin-token">
                  Admin token
                </label>
                <input
                  id="admin-token"
                  type="password"
                  placeholder="Admin token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                  required
                />
                <button disabled={busy}>
                  {busy ? "Connecting…" : "Connect →"}
                </button>
              </form>
            </div>
          )}
          {message && (
            <div className="message" role="status">
              {message}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}
          {section === "Overview" && (
            <>
              <div className="stats">
                {[
                  [
                    users.length,
                    "Total identities",
                    "Across a complete real estate enterprise",
                  ],
                  [
                    counts.employees,
                    "Employees",
                    "Investment, development & operations",
                  ],
                  [
                    counts.vendors,
                    "Embedded vendors",
                    "Partners with accountable managers",
                  ],
                  [
                    groups.length,
                    "Security groups",
                    "Purpose-based access and collaboration",
                  ],
                ].map(([n, label, desc]) => (
                  <article key={label}>
                    <span>{label}</span>
                    <strong>{n}</strong>
                    <small>{desc}</small>
                  </article>
                ))}
              </div>
              <div className="overviewgrid">
                <section className="card">
                  <div className="cardheading">
                    <h2>A company built around real work</h2>
                    <button
                      className="textbutton"
                      onClick={() => setSection("Organization")}
                    >
                      View organization →
                    </button>
                  </div>
                  <p>
                    From the first investment thesis to the day-to-day operation
                    of a property.
                  </p>
                  <div className="chain">
                    {["Invest", "Develop", "Build", "Lease", "Operate"].map(
                      (s, i) => (
                        <div key={s}>
                          <span>0{i + 1}</span>
                          <strong>{s}</strong>
                        </div>
                      ),
                    )}
                  </div>
                  <div className="orglist">
                    {baseline.organizations.map((o) => (
                      <div key={o.name}>
                        <span>{o.name}</span>
                        <b>{o.employees + o.vendors}</b>
                        <div className="bar">
                          <i
                            style={{
                              width: `${((o.employees + o.vendors) / 45) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <h2>Integration workspace</h2>
                  <p>
                    Configure your relying parties and test real enterprise
                    sign-in and provisioning flows.
                  </p>
                  {[
                    ["SAML 2.0", "Signed assertions & SP metadata"],
                    ["OpenID Connect", "Authorization code with PKCE"],
                    ["SCIM 2.0", "Users, groups & provisioning"],
                    ["WS-Federation", "Passive sign-in & signed tokens"],
                  ].map(([name, desc]) => (
                    <button
                      className="protocolrow"
                      key={name}
                      onClick={() => setSection("Protocol endpoints")}
                    >
                      <div className="protocolicon">↗</div>
                      <div>
                        <strong>{name}</strong>
                        <small>{desc}</small>
                      </div>
                      <span>→</span>
                    </button>
                  ))}
                  <div className="note">
                    <strong>Designed for a simulation</strong>
                    <p>
                      Use synthetic identities and a dedicated test environment.
                      Baseline data stays versioned; provisioning changes affect
                      live state.
                    </p>
                  </div>
                </section>
              </div>
            </>
          )}
          {section === "Directory" && (
            <section className="card">
              <div className="toolbar">
                <input
                  aria-label="Search identities"
                  placeholder="Search name, email, or job title…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Organization"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                >
                  {[
                    "All organizations",
                    ...baseline.organizations.map((o) => o.name),
                  ].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <span>{filtered.length} identities</span>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Identity</th>
                      <th>Role</th>
                      <th>Organization</th>
                      <th>Relationship</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u: RecordData) => (
                      <tr
                        key={u.id}
                        onClick={() => setSelected(u)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setSelected(u);
                        }}
                      >
                        <td>
                          <div className="person">
                            <span className="avatar">
                              {u.displayName
                                .split(" ")
                                .map((s: string) => s[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <div>
                              <strong>{u.displayName}</strong>
                              <small>{u.userName}</small>
                            </div>
                          </div>
                        </td>
                        <td>{u.title}</td>
                        <td>
                          {u.organization ||
                            u[
                              "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
                            ]?.organization}
                        </td>
                        <td>
                          <span
                            className={
                              u.userType === "Contractor"
                                ? "pill vendor"
                                : "pill"
                            }
                          >
                            {u.userType}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {section === "Groups" && (
            <section className="card">
              <div className="toolbar">
                <input
                  aria-label="Search groups"
                  placeholder="Search groups…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span>{groups.length} groups</span>
              </div>
              <div className="groupgrid">
                {groups
                  .filter((g: RecordData) =>
                    g.displayName.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((g: RecordData) => (
                    <button
                      className="group"
                      key={g.id}
                      onClick={() => setSelected(g)}
                    >
                      <small>
                        {g.kind ||
                          baseline.groups.find((b) => b.id === g.id)?.kind ||
                          "Provisioned group"}
                      </small>
                      <strong>{g.displayName}</strong>
                      <span>{g.members?.length || 0} members →</span>
                    </button>
                  ))}
              </div>
            </section>
          )}
          {section === "Organization" && (
            <div className="orgcards">
              {baseline.organizations.map((o) => (
                <section className="card" key={o.name}>
                  <div className="cardheading">
                    <h2>{o.name}</h2>
                    <span className="pill">
                      {o.employees + o.vendors} identities
                    </span>
                  </div>
                  <p>
                    {o.employees} employees · {o.vendors} embedded vendors
                  </p>
                  <div className="orgpeople">
                    {users
                      .filter(
                        (u: RecordData) =>
                          (u.organization ||
                            u[
                              "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
                            ]?.organization) === o.name,
                      )
                      .map((u: RecordData) => {
                        const managerId =
                          typeof u.manager === "string"
                            ? u.manager
                            : u[
                                "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
                              ]?.manager?.value;
                        const m = users.find(
                          (v: RecordData) => v.id === managerId,
                        );
                        return (
                          <button key={u.id} onClick={() => setSelected(u)}>
                            <strong>{u.displayName}</strong>
                            <span>{u.title}</span>
                            <small>
                              {m
                                ? `Reports to ${m.displayName}`
                                : "CEO · Organization root"}
                            </small>
                          </button>
                        );
                      })}
                  </div>
                </section>
              ))}
            </div>
          )}
          {section === "Applications" && (
            <section className="card">
              <h2>Application registrations</h2>
              <p>
                Register exact redirect URLs, client authentication, SAML SP
                metadata, encryption settings, and WS-Fed realms. Secrets are
                available only to an authenticated administrator.
              </p>
              {connected ? (
                <>
                  <label htmlFor="config">Tenant configuration</label>
                  <textarea
                    id="config"
                    spellCheck={false}
                    rows={24}
                    value={config}
                    onChange={(e) => setConfig(e.target.value)}
                  />
                  <div className="toolbar">
                    <button onClick={save} disabled={busy}>
                      {busy ? "Saving…" : "Save configuration"}
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        setConfig(
                          JSON.stringify(
                            {
                              persona: "generic",
                              clients: [
                                {
                                  client_id: "test-client",
                                  redirect_uris: [
                                    "http://localhost:3001/callback",
                                  ],
                                  post_logout_redirect_uris: [],
                                  grant_types: [
                                    "authorization_code",
                                    "refresh_token",
                                  ],
                                  response_types: ["code"],
                                  token_endpoint_auth_method: "none",
                                },
                              ],
                              samlApps: [],
                              wsfedApps: [],
                            },
                            null,
                            2,
                          ),
                        )
                      }
                    >
                      Insert local OIDC example
                    </button>
                  </div>
                  <p className="muted">
                    The example replaces the editor contents. Review before
                    saving. Deployment registrations require HTTPS.
                  </p>
                </>
              ) : (
                <div className="note">
                  Connect with your admin token above to load and edit
                  application registrations.
                </div>
              )}
            </section>
          )}
          {section === "Protocol endpoints" && (
            <section className="card">
              <h2>Connect your application</h2>
              <p>
                The tenant issuer and signing keys remain stable across
                deployments. Copy endpoints using your deployment origin.
              </p>
              {[
                ["OIDC issuer", "/api/t/realestate/oidc"],
                [
                  "OIDC discovery",
                  "/api/t/realestate/oidc/.well-known/openid-configuration",
                ],
                ["Signing keys (JWKS)", "/api/t/realestate/oidc/jwks"],
                ["SAML metadata", "/api/t/realestate/saml/metadata"],
                ["SAML sign-in", "/api/t/realestate/saml/sso"],
                ["SAML logout", "/api/t/realestate/saml/slo"],
                ["SCIM base URL", "/api/t/realestate/scim"],
                ["WS-Fed metadata", "/api/t/realestate/wsfed/metadata"],
                ["WS-Fed passive sign-in", "/api/t/realestate/wsfed"],
              ].map(([name, path]) => (
                <div className="endpoint" key={name}>
                  <strong>{name}</strong>
                  <code>{path}</code>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          location.origin + path,
                        );
                        setMessage(`${name} copied.`);
                      } catch {
                        setMessage("Copy from the endpoint text.");
                      }
                    }}
                  >
                    Copy
                  </button>
                </div>
              ))}
              <div className="note">
                SCIM requires the separate SCIM bearer token. OIDC uses
                registered clients. Federation uses registered metadata and
                realms. Credentials belong in the deployment environment.
              </div>
            </section>
          )}
          {section === "Activity" && (
            <section className="card">
              <h2>Recent activity</h2>
              <p>
                Last 100 configuration, provisioning, and sign-in events.
                Tokens, passwords, and assertions are excluded.
              </p>
              {directory?.events?.length ? (
                directory.events.map((e: RecordData, i: number) => (
                  <div className="endpoint" key={i}>
                    <strong>{e.type}</strong>
                    <code>{e.subject || "Workspace"}</code>
                    <small>{new Date(e.at).toLocaleString()}</small>
                  </div>
                ))
              ) : (
                <div className="note">
                  {connected
                    ? "No events recorded yet."
                    : "Connect to inspect live activity."}
                </div>
              )}
            </section>
          )}
          <footer>
            AuthNAuthZ{" "}
            <span>
              Real Estate archetype · Private Blob persistence · Configurable
              enterprise protocols
            </span>
            {connected && (
              <button
                className="textbutton"
                onClick={() => {
                  setConnected(false);
                  setToken("");
                  setDirectory(null);
                  setConfig("");
                  setMessage("Disconnected.");
                }}
              >
                Disconnect
              </button>
            )}
          </footer>
        </div>
      </main>
      {selected && (
        <div className="modal" onClick={() => setSelected(null)}>
          <section
            className="card"
            role="dialog"
            aria-modal="true"
            aria-label="Identity details"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cardheading">
              <h2>{selected.displayName}</h2>
              <button className="secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            {selected.userName ? (
              <>
                <p>{selected.title}</p>
                <dl>
                  {[
                    ["Email", selected.userName],
                    ["Relationship", selected.userType],
                    ["Status", selected.active ? "Active" : "Inactive"],
                    [
                      "Manager",
                      users.find(
                        (u: RecordData) =>
                          u.id ===
                          (selected.manager ||
                            selected[
                              "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
                            ]?.manager?.value),
                      )?.displayName || "Organization root",
                    ],
                    ["Identity ID", selected.id],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <h3>Group memberships</h3>
                <ul>
                  {groups
                    .filter((g: RecordData) =>
                      g.members?.some(
                        (m: RecordData) => m.value === selected.id,
                      ),
                    )
                    .map((g: RecordData) => (
                      <li key={g.id}>{g.displayName}</li>
                    ))}
                </ul>
              </>
            ) : (
              <ul>
                {selected.members?.map((m: RecordData) => (
                  <li key={m.value}>
                    {m.display ||
                      users.find((u: RecordData) => u.id === m.value)
                        ?.displayName ||
                      m.value}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
