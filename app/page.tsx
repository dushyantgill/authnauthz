"use client";
import { useState, useEffect, useMemo } from "react";
import { ProtocolSettings } from "../components/ProtocolSettings";
import baseline from "../data/summit-ridge.json";
type RecordData = Record<string, any>;
const sections = ["Overview", "Directory", "Configuration", "Activity"];
const configurationTabs = [
  "Domains",
  "OIDC",
  "SAML",
  "WS-Fed",
  "SCIM",
  "Deployment",
  "Advanced",
];
export default function Home() {
  const [section, setSection] = useState("Overview"),
    [overviewTab, setOverviewTab] = useState("Summary"),
    [directoryTab, setDirectoryTab] = useState("Users"),
    [configurationTab, setConfigurationTab] = useState("Domains"),
    [deployment, setDeployment] = useState<RecordData | null>(null),
    [token, setToken] = useState(""),
    [connected, setConnected] = useState(false),
    [simulationPassword, setSimulationPassword] = useState(""),
    [employeeDomain, setEmployeeDomain] = useState("summitridge.example"),
    [contractorDomain, setContractorDomain] = useState("summitridge.example"),
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
  async function loadState() {
    const [d, c, status] = await Promise.all([
      request("/api/admin/directory"),
      request("/api/admin/config"),
      request("/api/admin/status"),
    ]);
    setDirectory(d);
    setEmployeeDomain(c.accountDomains?.employee || "summitridge.example");
    setContractorDomain(c.accountDomains?.contractor || "summitridge.example");
    setConfig(JSON.stringify(c, null, 2));
    setDeployment(status);
    setConnected(true);
    return c;
  }
  async function connect() {
    setBusy(true);
    try {
      await loadState();
      setMessage("Connected to live simulator state.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDomains(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const expected = {
      employee: employeeDomain.trim().toLowerCase(),
      contractor: contractorDomain.trim().toLowerCase(),
    };
    try {
      await request("/api/admin/domains", {
        method: "PUT",
        body: JSON.stringify(expected),
      });
      const saved = await loadState();
      if (
        saved.accountDomains.employee !== expected.employee ||
        saved.accountDomains.contractor !== expected.contractor
      )
        throw Error(
          "The server did not return the saved domains. Please refresh and try again.",
        );
      setMessage(
        "Account domains saved and verified. Usernames and work emails have been updated.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await request("/api/admin/password", {
        method: "PUT",
        body: JSON.stringify({ password: simulationPassword }),
      });
      setSimulationPassword("");
      await loadState();
      setMessage(
        "Simulator password saved. Existing sessions and tokens have been revoked.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveConfiguration(next: RecordData) {
    await request("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify(next),
    });
    await loadState();
    setMessage("Configuration saved and refreshed.");
  }
  async function save() {
    setBusy(true);
    try {
      await saveConfiguration(JSON.parse(config));
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
        <a className="brand" href="/" aria-label="AuthNAuthZ home">
          <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <path
              d="M8 14h20v15h20v20h12M8 50h20V35h20V15h12"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="14" r="5" fill="currentColor" />
            <circle cx="8" cy="50" r="5" fill="currentColor" />
          </svg>
          <span>
            AuthN<b>AuthZ</b>
          </span>
        </a>
        <div className="tenant">
          <span className="avatar">RE</span>
          <div>
            <strong>Real Estate</strong>
            <small>Enterprise archetype</small>
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
              <span>{["◈", "♙", "⌘", "◷"][i]}</span>
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
              <div className="eyebrow">REAL ESTATE</div>
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
            <div className="tabs" role="tablist" aria-label="Overview views">
              {["Summary", "Organization"].map((t) => (
                <button
                  role="tab"
                  aria-selected={overviewTab === t}
                  className={overviewTab === t ? "active" : "secondary"}
                  key={t}
                  onClick={() => setOverviewTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {section === "Directory" && (
            <div className="tabs" role="tablist" aria-label="Directory views">
              {["Users", "Groups"].map((t) => (
                <button
                  role="tab"
                  aria-selected={directoryTab === t}
                  className={directoryTab === t ? "active" : "secondary"}
                  key={t}
                  onClick={() => {
                    setDirectoryTab(t);
                    setQuery("");
                    setSelected(null);
                  }}
                >
                  {t} ({t === "Users" ? users.length : groups.length})
                </button>
              ))}
            </div>
          )}
          {section === "Configuration" && (
            <div
              className="tabs"
              role="tablist"
              aria-label="Configuration views"
            >
              {configurationTabs.map((t) => (
                <button
                  role="tab"
                  aria-selected={configurationTab === t}
                  className={configurationTab === t ? "active" : "secondary"}
                  key={t}
                  onClick={() => setConfigurationTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {connected && deployment?.issues?.length > 0 && (
            <div className="note">
              <strong>Deployment needs attention</strong>
              <p>{deployment?.issues.join(" ")}</p>
              <button
                className="secondary"
                onClick={() => {
                  setSection("Configuration");
                  setConfigurationTab("Deployment");
                }}
              >
                Review deployment settings
              </button>
            </div>
          )}
          {section === "Overview" && overviewTab === "Summary" && (
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
                      onClick={() => setOverviewTab("Organization")}
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
                      onClick={() => {
                        setSection("Configuration");
                        setConfigurationTab(
                          name === "SAML 2.0"
                            ? "SAML"
                            : name === "OpenID Connect"
                              ? "OIDC"
                              : name === "SCIM 2.0"
                                ? "SCIM"
                                : "WS-Fed",
                        );
                      }}
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
          {section === "Directory" && directoryTab === "Users" && (
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
          {section === "Directory" && directoryTab === "Groups" && (
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
          {section === "Overview" && overviewTab === "Organization" && (
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
          {section === "Configuration" && configurationTab === "Domains" && (
            <section className="card">
              <h2>Account domains</h2>
              <p>
                Set the domain suffix for employee and vendor/contractor
                accounts. Saving updates existing usernames and work emails.
                Identity IDs, reporting lines, and group memberships stay the
                same.
              </p>
              {connected ? (
                <form onSubmit={saveDomains} className="domain-form">
                  <label htmlFor="employee-domain">Employee domain</label>
                  <input
                    id="employee-domain"
                    value={employeeDomain}
                    onChange={(e) => setEmployeeDomain(e.target.value)}
                    placeholder="employees.example.com"
                    required
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <label htmlFor="contractor-domain">
                    Vendor / contractor domain
                  </label>
                  <input
                    id="contractor-domain"
                    value={contractorDomain}
                    onChange={(e) => setContractorDomain(e.target.value)}
                    placeholder="partners.example.com"
                    required
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <p>
                    Enter a domain only, without @ or https://. Accounts keep
                    their current username prefix. Use the updated username when
                    signing in; external applications may need their account
                    mappings updated.
                  </p>
                  <button disabled={busy}>
                    {busy ? "Saving…" : "Save account domains"}
                  </button>
                </form>
              ) : (
                <p>Connect with your admin token to change account domains.</p>
              )}
            </section>
          )}
          {section === "Configuration" && configurationTab === "Domains" && (
            <section className="card">
              <h2>Simulated login password</h2>
              <p>
                All active simulated accounts use this shared test password. It
                applies to OIDC, SAML, and WS-Fed login. Changing it revokes
                existing sessions and tokens. The password is stored as a salted
                hash in encrypted simulator state.
              </p>
              {connected ? (
                <form className="domain-form" onSubmit={savePassword}>
                  <p>
                    Login password:{" "}
                    {deployment?.simulationPasswordConfigured
                      ? "Configured"
                      : "Not configured"}
                  </p>
                  <label htmlFor="simulation-password">
                    New shared test password
                  </label>
                  <input
                    id="simulation-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={128}
                    required
                    value={simulationPassword}
                    onChange={(e) => setSimulationPassword(e.target.value)}
                  />
                  <button disabled={busy}>
                    {busy ? "Saving…" : "Set test password"}
                  </button>
                </form>
              ) : (
                <p>
                  Connect with your admin token to set the shared login
                  password.
                </p>
              )}
            </section>
          )}
          {section === "Configuration" && configurationTab === "Advanced" && (
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
          {section === "Configuration" &&
            ["OIDC", "SAML", "WS-Fed", "SCIM", "Deployment"].includes(
              configurationTab,
            ) && (
              <ProtocolSettings
                protocol={configurationTab}
                config={
                  config
                    ? (() => {
                        try {
                          return JSON.parse(config);
                        } catch {
                          return {};
                        }
                      })()
                    : {}
                }
                connected={connected}
                deployment={deployment}
                onSave={saveConfiguration}
              />
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
                  setDeployment(null);
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
