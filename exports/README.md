# Flat CSV directory imports

Six files: realestate/users.csv and groups.csv; biotech/users.csv and groups.csv; insurance/users.csv and groups.csv.

All three contain 267 users (238 employees and 29 contractors). Real Estate has 185 groups; Biotech and Insurance have 213 each. These are deterministic baseline snapshots, not live production domain or SCIM changes.

Import users first. Preserve id, or keep an old-to-new ID mapping. managerId references a user id. Import groups next: memberIds contains semicolon-separated user IDs; memberCount states the number of memberships. Apply the same ID mapping to managerId and memberIds if WorkSynth generates new IDs. CSVs use UTF-8, quoted values and CRLF line endings.

User columns: id, userName, email, displayName, givenName, familyName, active, userType, title, organization, department, managerId, location, country, phone, photoFile.
Group columns: id, displayName, kind, memberCount, memberIds.

No passwords, tokens, keys, sessions or sensitive case status are included. Domain suffixes are seed defaults; change them in the importer if desired. photoFile refers to photos/<alias>.jpg relative to the download root. The GitHub archive contains CSVs only; the locally provided archive also contains all 267 original portraits shared by the three directories.

WorkSynth-specific column mapping may be needed. Regenerate with npx tsx scripts/export-directories.ts.
