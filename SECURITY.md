# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/kypflug/badgy/security/advisories/new).
Include the affected version or commit, reproduction steps, and the impact you observed.

You can expect an initial response within a few days. Once a fix is available it will be
deployed to https://badgy.tech and released here, and you will be credited unless you ask
otherwise.

## Scope

Badgy is a client-side calendar with a small authentication backend:

- **In scope** — the web app (`packages/web`), the shared core (`packages/shared`), and the
  Azure Functions auth mediator (`packages/api`): session handling, PKCE transactions, token
  encryption, cookie flags, and anything that could expose another user's data.
- **Out of scope** — vulnerabilities in Microsoft Entra ID, Microsoft Graph, OneDrive, Google
  Identity, Google Drive or Azure Static Web Apps themselves. Report those to
  [Microsoft MSRC](https://msrc.microsoft.com/report) or the
  [Google VRP](https://bughunters.google.com/report).

## Data handling

Attendance data never passes through the backend — the browser talks to Microsoft Graph or Google
Drive directly and stores the document in a hidden per-app folder in the signed-in user's own
cloud storage (the OneDrive app folder, or Drive's `appDataFolder`). The backend holds only an
encrypted per-provider token cache and short-lived auth transactions in Azure Table Storage. If you
find a path where attendance data, tokens, cookies or polling secrets are logged or leaked, treat
it as a security issue and report it privately.
