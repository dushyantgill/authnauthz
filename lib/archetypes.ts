import realestate from "../data/summit-ridge.json";
export const archetypes = {
  realestate: {
    name: "Real Estate",
    initials: "RE",
    color: "#385c3c",
    accent: "#d7efae",
    motif: "Built on trust",
    description:
      "From investment thesis to the day-to-day operation of a property.",
    stages: ["Invest", "Develop", "Build", "Lease", "Operate"],
  },
  biotech: {
    name: "Biotech / Life Sciences",
    initials: "BIO",
    color: "#075d69",
    accent: "#b3f0e4",
    motif: "Discover. Develop. Deliver.",
    description:
      "From discovery research through clinical development and manufacturing readiness.",
    stages: ["Discover", "Translate", "Study", "Validate", "Deliver"],
  },
  insurance: {
    name: "Insurance",
    initials: "INS",
    color: "#233d75",
    accent: "#c9dcff",
    motif: "Confidence in every decision",
    description:
      "From risk selection and pricing to policy service and claims resolution.",
    stages: ["Assess", "Price", "Underwrite", "Serve", "Resolve"],
  },
} as const;
export type ArchetypeId = keyof typeof archetypes;
export function archetypeId(value: unknown = "realestate"): ArchetypeId {
  if (typeof value !== "string" || !Object.hasOwn(archetypes, value))
    throw Error("Unknown archetype");
  return value as ArchetypeId;
}
type Branch = [string, string, number, number, [string, string][]];
const branches: Record<string, Branch[]> = {
  biotech: [
    [
      "Executive & Portfolio Strategy",
      "Chief Executive Officer",
      7,
      0,
      [
        ["Portfolio Strategy", "Portfolio Strategy Analyst"],
        ["Executive Operations", "Executive Operations Coordinator"],
      ],
    ],
    [
      "Discovery & Translational Science",
      "Chief Scientific Officer",
      48,
      5,
      [
        ["Discovery Biology", "Research Scientist, Discovery Biology"],
        ["Translational Medicine", "Translational Scientist"],
        ["Bioinformatics", "Computational Biologist"],
      ],
    ],
    [
      "Clinical Development & Operations",
      "Chief Medical Officer",
      41,
      8,
      [
        ["Clinical Operations", "Clinical Trial Manager"],
        ["Biostatistics", "Biostatistician"],
        ["Clinical Data Management", "Clinical Data Manager"],
      ],
    ],
    [
      "Technical Operations & CMC",
      "VP, Technical Operations",
      33,
      6,
      [
        ["Process Development", "Process Development Scientist"],
        ["Analytical Development", "Analytical Scientist"],
        ["Manufacturing & Supply", "Manufacturing Sciences Engineer"],
      ],
    ],
    [
      "Quality & Regulatory Affairs",
      "VP, Quality & Regulatory Affairs",
      28,
      4,
      [
        ["Quality Assurance", "Quality Assurance Specialist"],
        ["Quality Control", "Quality Control Analyst"],
        ["Regulatory Affairs", "Regulatory Affairs Manager"],
      ],
    ],
    [
      "Medical Affairs & Drug Safety",
      "VP, Medical Affairs & Drug Safety",
      18,
      2,
      [
        ["Medical Affairs", "Medical Science Liaison"],
        ["Pharmacovigilance", "Drug Safety Specialist"],
        ["Medical Information", "Medical Information Specialist"],
      ],
    ],
    [
      "Finance & Business Development",
      "Chief Financial Officer",
      23,
      2,
      [
        ["Finance", "FP&A Analyst"],
        ["Accounting", "Senior Accountant"],
        ["Business Development", "Alliance Manager"],
      ],
    ],
    [
      "Legal & Compliance",
      "General Counsel",
      12,
      1,
      [
        ["Intellectual Property", "Senior Counsel, Intellectual Property"],
        ["Contracts", "Clinical Contracts Manager"],
        ["Compliance", "Compliance Analyst"],
      ],
    ],
    [
      "People, Technology & Facilities",
      "Chief People & Technology Officer",
      28,
      1,
      [
        ["People Operations", "HR Business Partner"],
        ["Information Technology", "Systems Engineer"],
        ["Lab & Facilities Operations", "Laboratory Operations Specialist"],
      ],
    ],
  ],
  insurance: [
    [
      "Executive & Corporate Strategy",
      "Chief Executive Officer",
      7,
      0,
      [
        ["Corporate Strategy", "Strategy Analyst"],
        ["Executive Operations", "Executive Operations Coordinator"],
      ],
    ],
    [
      "Underwriting & Product",
      "Chief Underwriting Officer",
      42,
      3,
      [
        ["Commercial Underwriting", "Commercial Lines Underwriter"],
        ["Personal Underwriting", "Personal Lines Underwriter"],
        ["Product Management", "Insurance Product Manager"],
      ],
    ],
    [
      "Claims & Special Investigations",
      "Chief Claims Officer",
      47,
      9,
      [
        ["Property Claims", "Property Claims Adjuster"],
        ["Liability Claims", "Liability Claims Examiner"],
        ["Special Investigations", "Special Investigations Analyst"],
      ],
    ],
    [
      "Actuarial, Analytics & Reinsurance",
      "Chief Actuary",
      30,
      4,
      [
        ["Pricing", "Pricing Actuary"],
        ["Reserving", "Reserving Actuary"],
        ["Reinsurance", "Reinsurance Analyst"],
      ],
    ],
    [
      "Distribution & Marketing",
      "Chief Distribution Officer",
      26,
      3,
      [
        ["Agency Partnerships", "Agency Relationship Manager"],
        ["Sales Operations", "Sales Operations Analyst"],
        ["Marketing", "Marketing Specialist"],
      ],
    ],
    [
      "Policy & Customer Operations",
      "Chief Operations Officer",
      27,
      4,
      [
        ["Policy Administration", "Policy Services Specialist"],
        ["Customer Service", "Customer Experience Specialist"],
        ["Billing", "Billing Operations Analyst"],
      ],
    ],
    [
      "Finance & Investments",
      "Chief Financial Officer",
      24,
      2,
      [
        ["Accounting", "Statutory Accountant"],
        ["Treasury", "Treasury Analyst"],
        ["Investments", "Investment Analyst"],
      ],
    ],
    [
      "Legal, Risk & Compliance",
      "General Counsel & Chief Risk Officer",
      16,
      2,
      [
        ["Legal", "Senior Counsel, Insurance"],
        ["Enterprise Risk", "Enterprise Risk Analyst"],
        ["Compliance", "Market Conduct Compliance Analyst"],
      ],
    ],
    [
      "People & Technology",
      "Chief People & Technology Officer",
      19,
      2,
      [
        ["People Operations", "HR Business Partner"],
        ["Information Technology", "Systems Engineer"],
        ["Security & Data", "Security Engineer"],
      ],
    ],
  ],
};
const applications: Record<string, string[]> = {
  biotech: [
    "ELN",
    "LIMS",
    "CTMS",
    "EDC",
    "eTMF",
    "QMS",
    "REGULATORY-VAULT",
    "SAFETY",
    "ERP",
  ],
  insurance: [
    "UNDERWRITING",
    "POLICY-ADMIN",
    "CLAIMS",
    "SIU",
    "ACTUARIAL",
    "REINSURANCE",
    "AGENCY-PORTAL",
    "CRM",
    "ERP",
  ],
};
// Deterministic UUID-shaped identifiers keep tenants separate without browser crypto dependencies.
function identity(t: string, n: number) {
  return `${t === "biotech" ? "b107ec00" : "1a5a0000"}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
function generated(t: "biotech" | "insurance"): typeof realestate {
  const users: typeof realestate.users = [],
    organizations: typeof realestate.organizations = [],
    groups: typeof realestate.groups = [];
  let serial = 0;
  for (const [name, headTitle, employees, vendors, departments] of branches[
    t
  ]) {
    const head = identity(t, serial + 1),
      managers: string[] = [];
    for (let i = 0; i < employees + vendors; i++) {
      const source = realestate.users[serial],
        id = identity(t, serial + 1),
        d =
          i === 0 ? departments[0] : departments[(i - 1) % departments.length];
      const leader = i > 0 && i <= departments.length;
      const userType = i >= employees ? "Contractor" : "Employee";
      users.push({
        ...source,
        id,
        userName:
          source.userName.split("@")[0] +
          "@" +
          (userType === "Contractor" ? "partners." : "") +
          t +
          ".example",
        userType,
        organization: name,
        department: i === 0 ? "Leadership" : d[0],
        title:
          i === 0
            ? headTitle
            : leader
              ? "Director, " + d[0]
              : d[1] + (userType === "Contractor" ? " (Contractor)" : ""),
        manager:
          serial === 0
            ? null
            : i === 0
              ? users[0].id
              : leader
                ? head
                : managers[(i - 1) % departments.length] || head,
        location:
          t === "biotech"
            ? ["Boston", "Cambridge", "Research Triangle Park"][serial % 3]
            : ["Chicago", "Columbus", "Dallas"][serial % 3],
      });
      if (leader) managers.push(id);
      serial++;
    }
    organizations.push({ name, employees, vendors, head });
  }
  function add(name: string, kind: string, members: typeof users) {
    if (!members.length) return;
    groups.push({
      id: identity(t, 10000 + groups.length),
      displayName: name,
      kind,
      members: members.map((u) => ({ value: u.id, display: u.displayName })),
    });
  }
  const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  for (const org of organizations) {
    const team = users.filter((u) => u.organization === org.name);
    add("ORG-" + slug(org.name), "Organization", team);
    for (const d of new Set(team.map((u) => u.department)))
      add(
        "DEPT-" + slug(org.name + "-" + d),
        "Department",
        team.filter((u) => u.department === d),
      );
  }
  for (const title of new Set(
    users.map((u) => u.title.replace(" (Contractor)", "")),
  ))
    add(
      "ROLE-" + slug(title),
      "Role",
      users.filter((u) => u.title.replace(" (Contractor)", "") === title),
    );
  for (const manager of users.filter((u) =>
    users.some((v) => v.manager === u.id),
  )) {
    add(
      "TEAM-" + slug(manager.userName.split("@")[0]) + "-DIRECT",
      "Manager",
      users.filter((u) => u.manager === manager.id),
    );
    const descendants = new Set([manager.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of users)
        if (u.manager && descendants.has(u.manager) && !descendants.has(u.id)) {
          descendants.add(u.id);
          changed = true;
        }
    }
    add(
      "TEAM-" + slug(manager.userName.split("@")[0]) + "-ROLLUP",
      "Manager rollup",
      users.filter((u) => descendants.has(u.id) && u.id !== manager.id),
    );
  }
  for (const loc of new Set(users.map((u) => u.location)))
    add(
      "LOC-" + slug(loc),
      "Location",
      users.filter((u) => u.location === loc),
    );
  add(
    "ALL-EMPLOYEES",
    "Workforce",
    users.filter((u) => u.userType === "Employee"),
  );
  add(
    "ALL-CONTRACTORS",
    "Workforce",
    users.filter((u) => u.userType === "Contractor"),
  );
  applications[t].forEach((app, i) => {
    const members = users.filter(
      (u) =>
        u.organization ===
        organizations[
          (t === "biotech"
            ? [1, 3, 2, 2, 2, 4, 4, 5, 6]
            : [1, 5, 2, 2, 3, 3, 4, 4, 6])[i]
        ].name,
    );
    add("APP-" + app + "-USERS", "Application", members);
    add(
      "APP-" + app + "-APPROVERS",
      "Application",
      members.filter(
        (u) =>
          u.title.startsWith("Director") ||
          u.id ===
            organizations[
              (t === "biotech"
                ? [1, 3, 2, 2, 2, 4, 4, 5, 6]
                : [1, 5, 2, 2, 3, 3, 4, 4, 6])[i]
            ].head,
      ),
    );
    add(
      "APP-" + app + "-ADMINS",
      "Application",
      users
        .filter(
          (u) =>
            u.department === "Information Technology" &&
            u.userType === "Employee",
        )
        .slice(0, 2),
    );
  });
  const projects =
    t === "biotech"
      ? [
          "ONCOLOGY-PHASE-2",
          "IMMUNOLOGY-PHASE-1",
          "CMC-TECH-TRANSFER",
          "REGULATORY-SUBMISSION",
          "QUALITY-AUDIT",
          "LAB-DATA-MODERNIZATION",
        ]
      : [
          "COMMERCIAL-PROPERTY",
          "PERSONAL-AUTO",
          "CATASTROPHE-RESPONSE",
          "CLAIMS-MODERNIZATION",
          "RATE-FILING",
          "REINSURANCE-RENEWAL",
        ];
  projects.forEach((p, i) =>
    add(
      "PROJECT-" + p,
      "Project",
      users
        .filter(
          (u) =>
            u.userType === "Employee" &&
            (organizations.findIndex((o) => o.name === u.organization) ===
              i + 1 ||
              u.department === "Compliance"),
        )
        .filter((_, j) => j % 3 === 0),
    ),
  );
  return {
    ...realestate,
    tenant: t,
    company: archetypes[t].name,
    archetype: archetypes[t].name,
    organizations,
    users,
    groups,
  };
}
export const seeds = {
  realestate,
  biotech: generated("biotech"),
  insurance: generated("insurance"),
};
