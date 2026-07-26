# Deployment runbook — Badgy

Badgy is an Azure Static Web App with a managed Azure Functions authentication BFF. The BFF stores
encrypted Microsoft and Google refresh-token caches and short-lived auth transactions in Azure Table
Storage. Calendar data never passes through the BFF; the browser calls Microsoft Graph or Google
Drive directly.

## Prerequisites

- Azure CLI authenticated to the target subscription
- Node 24
- Azure Static Web Apps CLI for manual deployments, or the configured GitHub Actions workflow

## Microsoft app registration

Create a confidential web application that supports personal Microsoft accounts and register:

```text
https://badgy.tech/api/auth/callback
```

Create a client secret and grant delegated Microsoft Graph scopes:

```text
User.Read
Files.ReadWrite.AppFolder
offline_access
openid
profile
```

Badgy uses the `consumers` authority. Normal sign-in allows Microsoft SSO; the account picker is
requested only by the explicit **Use another account** action.

## Google OAuth client

> **Google sign-in ships disabled.** The web build gates the button on `GOOGLE_ENABLED`, which
> `.github/workflows/deploy.yml` sets to `'false'`. The Drive transport and the BFF provider ship
> regardless, so turning Google on is a build-flag flip plus the two app settings below — no code
> change. Do that only once the steps in this section are complete.

In the Google Cloud console, create an **OAuth 2.0 Client ID** of type **Web application** and
register the same callback path:

```text
https://badgy.tech/api/auth/callback
```

Declare these scopes on the OAuth consent screen:

```text
openid
email
profile
https://www.googleapis.com/auth/drive.appdata
```

`drive.appdata` reaches only Badgy's own hidden folder in the user's Drive — it cannot see any other
file — but it is still a **sensitive scope**. An unverified app is limited to 100 test users, so
**Google verification is a launch prerequisite** for public Google sign-in, and is the reason
`GOOGLE_ENABLED` defaults to `'false'`. Provide the consent screen with a justification describing
the app-data folder as the user's private attendance document.

To enable Google sign-in once verification is granted: set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` in Static Web App settings, then change `GOOGLE_ENABLED` to `'true'` in
`.github/workflows/deploy.yml` and redeploy. Note the BFF is independently gated by whether those
two settings are present — a `provider: "google"` request with no credentials configured returns
`503 temporarily_unavailable` rather than a broken sign-in.

Two Google-specific behaviours are deliberate and should not be "optimised" away:

- The authorization request always sends `prompt=consent`. Google issues a refresh token with
  `access_type=offline` only on a user's *first* consent, and the BFF has no way to know at
  authorize time whether a grant already exists — without unconditional re-consent, every returning
  Google user would fail to sign in with `invalid_grant`.
- Drive v3 has **no ETag and ignores `If-Match`**, so the Google transport uses the file's `version`
  field as its concurrency token and re-reads it immediately before writing. This is weaker than the
  Graph path's conditional write; it is safe here only because the document is a CRDT and every
  client keeps a local copy, so a write that loses the race is merged and re-pushed on the next sync.

## Storage and encryption

Create an Azure Storage account and a `tokencache` table. Generate independent 32-byte base64 keys
for session-cookie encryption and token/transaction encryption.

Configure these Static Web App settings:

| Setting | Purpose |
|---|---|
| `MSAL_CLIENT_ID` | Microsoft app client ID |
| `MSAL_CLIENT_SECRET` | Microsoft confidential-client secret |
| `MSAL_AUTHORITY` | `https://login.microsoftonline.com/consumers` |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret |
| `APP_BASE_URL` | `https://badgy.tech` |
| `SESSION_KEY` | 32-byte base64 session-cookie key |
| `TOKEN_ENC_KEY` | 32-byte base64 token/transaction encryption key |
| `STORAGE_CONNECTION` | Storage connection string containing `tokencache` |

Do not expose these values to the web build or commit them.

> `MSAL_CLIENT_ID` is a **public** identifier — it is embedded in the shipped JavaScript bundle and
> is set directly in `.github/workflows/deploy.yml`. Only `MSAL_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`,
> `GOOGLE_CLIENT_SECRET`, `SESSION_KEY`, `TOKEN_ENC_KEY` and `STORAGE_CONNECTION` are configured in
> Static Web App settings.

Per-user token caches are namespaced by provider in Table Storage. Microsoft rows keep their legacy
un-prefixed key derivation so existing sessions survive the upgrade; Google rows are keyed on
`google:<uid>`.

## Workplace routing

Employer presets are reached by path — `https://badgy.tech/amazon`, `/google`, `/microsoft` — which
the SPA rewrite in `staticwebapp.config.json` already serves, so **adding a preset needs no
infrastructure change at all**. The app resolves a workplace from, in order: the hostname's first
label, the first path segment, `?org=`, then the choice it remembered last time.

Because hostname resolution is checked first, pointing `amazon.badgy.tech` at the app later requires
only a DNS record plus a Static Web Apps custom domain — no code change. Note the platform limits
though: **Azure Static Web Apps supports at most 5 custom domains and no wildcard** (`*.badgy.tech`).
Serving a sub-domain per employer at scale would mean putting Azure Front Door in front of the
Static Web App, which is why path routing is the shipping mechanism.

If you do add a sub-domain, the session cookie must be widened to the registrable domain
(`Domain=.badgy.tech`) and the Google/Microsoft callbacks must stay on the apex, or each sub-domain
needs its own registered redirect URI.

## Authentication flow

1. The dock app calls `POST /api/auth/start` with the chosen `provider`.
2. The API stores PKCE state server-side and returns the provider's authorization URL plus a
   separate one-time polling secret.
3. Provider auth can run in regular Safari or another context.
4. `/api/auth/callback` redeems the code against the transaction's provider and marks the server
   transaction complete.
5. The original dock app polls `POST /api/auth/complete`; that same-origin response sets its
   HttpOnly session cookie in the correct Safari cookie jar.
6. `/api/token` uses the encrypted server-held cache to mint short-lived Graph or Google access
   tokens, and `/api/auth/me` reports which provider the session belongs to so the client picks the
   matching storage transport.

The legacy cookie-bound callback remains temporarily for Microsoft clients running an older cached
service worker and should be removed after the transaction flow is fully rolled out.

## Build and deploy

The production workflow is `.github/workflows/deploy.yml`. A push to `main`:

1. Generates `data/` into `packages/shared/src/generated/`, then installs and builds shared + web
   with the public client ID embedded.
2. Installs and builds `packages/api` with its own lockfile.
3. Deploys `packages/web/dist` and `packages/api` using
   `AZURE_STATIC_WEB_APPS_API_TOKEN`.

Local validation:

```bash
npm ci
npm run gates

npm --prefix packages/api ci
npm --prefix packages/api run build
npm --prefix packages/api test
```

For auth testing, run the web and Functions together through SWA CLI with equivalent local settings.
