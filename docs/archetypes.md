# Archetype design

All three models contain 267 synthetic identities: 238 employees and 29 embedded vendors. The original Real Estate projection and 185 groups are unchanged. New directories reuse synthetic names and aliases but receive distinct stable IDs, domains, locations, departments, titles, managers and memberships. No patient, policyholder, clinical subject, claim, visa or trafficking-status records appear in IAM attributes.

## Biotech / Life Sciences

A clinical-stage therapeutics company with outsourced clinical and manufacturing partnerships. Nine organizations:

| Organization                      | Employees | Vendors | Leader                            |
| --------------------------------- | --------: | ------: | --------------------------------- |
| Executive & Portfolio Strategy    |         7 |       0 | CEO                               |
| Discovery & Translational Science |        48 |       5 | Chief Scientific Officer          |
| Clinical Development & Operations |        41 |       8 | Chief Medical Officer             |
| Technical Operations & CMC        |        33 |       6 | VP, Technical Operations          |
| Quality & Regulatory Affairs      |        28 |       4 | VP, Quality & Regulatory Affairs  |
| Medical Affairs & Drug Safety     |        18 |       2 | VP, Medical Affairs & Drug Safety |
| Finance & Business Development    |        23 |       2 | CFO                               |
| Legal & Compliance                |        12 |       1 | General Counsel                   |
| People, Technology & Facilities   |        28 |       1 | Chief People & Technology Officer |

Functional directors lead discovery biology, translational medicine, bioinformatics, clinical operations, biostatistics, clinical data management, process and analytical development, manufacturing/supply, QA/QC, regulatory affairs, pharmacovigilance and medical information. Specialist roles include computational biologists, clinical trial managers, biostatisticians, process scientists, drug safety specialists, IP counsel and laboratory operations specialists. Embedded vendors report to employee managers in their working department.

## Insurance

A mid-sized property-and-casualty insurer with commercial and personal lines, agency distribution, third-party claims support and reinsurance.

| Organization                       | Employees | Vendors | Leader                               |
| ---------------------------------- | --------: | ------: | ------------------------------------ |
| Executive & Corporate Strategy     |         7 |       0 | CEO                                  |
| Underwriting & Product             |        42 |       3 | Chief Underwriting Officer           |
| Claims & Special Investigations    |        47 |       9 | Chief Claims Officer                 |
| Actuarial, Analytics & Reinsurance |        30 |       4 | Chief Actuary                        |
| Distribution & Marketing           |        26 |       3 | Chief Distribution Officer           |
| Policy & Customer Operations       |        27 |       4 | COO                                  |
| Finance & Investments              |        24 |       2 | CFO                                  |
| Legal, Risk & Compliance           |        16 |       2 | General Counsel & Chief Risk Officer |
| People & Technology                |        19 |       2 | Chief People & Technology Officer    |

Departments include commercial/personal underwriting, product, property/liability claims, SIU, pricing/reserving, reinsurance, agency partnerships, policy administration, customer service, billing, statutory accounting, treasury, enterprise risk and market-conduct compliance. Titles include underwriters, adjusters, claims examiners, pricing/reserving actuaries, reinsurance analysts, agency relationship managers and statutory accountants.

## Group strategy

Both new archetypes have 213 deterministic groups. Organization and department groups follow the hierarchy; role groups follow job families; direct-team and recursive-rollup groups follow managers. Workforce and location groups support ordinary collaboration. Cross-functional project groups represent trials, CMC transfer, regulatory submissions and audits in biotech, and line-of-business initiatives, catastrophe response, rate filings and reinsurance renewals in insurance.

Application groups separate users, approvers and administrators. Biotech examples: ELN, LIMS, CTMS, EDC, eTMF, QMS, regulatory vault, safety and ERP. Insurance examples: underwriting, policy administration, claims, SIU, actuarial, reinsurance, agency portal, CRM and ERP. Administrators are a small subset of employee IT staff. These names simulate entitlements; no group grants access to an actual external clinical or insurance system. Treat approval and administrator memberships as separate responsibilities when configuring a relying party.

Group creation must have a business purpose, owner and membership rule. Avoid arbitrary empty groups and encoding sensitive personal characteristics. Stable IDs support SCIM, while group claims expose actual runtime memberships. Protocol tests and tenant isolation do not rewrite the immutable seeds.

## Branding and state

Employee domain `limekube.com` produces the login brand **LIMEKUBE**, without a hardcoded company name. Real Estate uses a building mark and green palette; Biotech uses a DNA mark and teal palette; Insurance uses a shield mark and blue palette. OIDC login/consent, SAML login and WS-Fed login use the same tenant-aware brand. These settings are data-plane configuration saved in Blob; `APP_URL` defines protocol endpoints, not user email suffixes.

The archetypes are fictional designs informed by the industry's functional categories, not organizational charts of named companies. References: [BIO science and regulatory](https://www.bio.org/science-and-regulatory), [BIO manufacturing, quality and clinical committees](https://www.bio.org/sites/default/files/2021-01/BIO-Committees-Health-ECS_0.pdf), and [NAIC insurance functions and analytics](https://content.naic.org/insurance-topics/big-data).
