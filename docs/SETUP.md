# Deployment runbook — Badgy

Badgy is an Azure Static Web App with a managed Azure Functions authentication BFF. The BFF stores
encrypted Microsoft refresh-token caches and short-lived auth transactions in Azure Table Storage.
Calendar data never passes through the BFF; the browser calls Microsoft Graph directly.

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

## Storage and encryption

Create an Azure Storage account and a `tokencache` table. Generate independent 32-byte base64 keys
for session-cookie encryption and token/transaction encryption.

Configure these Static Web App settings:

| Setting | Purpose |
|---|---|
| `MSAL_CLIENT_ID` | Microsoft app client ID |
| `MSAL_CLIENT_SECRET` | Confidential-client secret |
| `MSAL_AUTHORITY` | `https://login.microsoftonline.com/consumers` |
| `APP_BASE_URL` | `https://badgy.tech` |
| `SESSION_KEY` | 32-byte base64 session-cookie key |
| `TOKEN_ENC_KEY` | 32-byte base64 token/transaction encryption key |
| `STORAGE_CONNECTION` | Storage connection string containing `tokencache` |

Do not expose these values to the web build or commit them.

> `MSAL_CLIENT_ID` is a **public** identifier — it is embedded in the shipped JavaScript bundle and
> is set directly in `.github/workflows/deploy.yml`. Only `MSAL_CLIENT_SECRET`, `SESSION_KEY`,
> `TOKEN_ENC_KEY` and `STORAGE_CONNECTION` are secrets, and those live solely in Static Web App
> settings.

## Authentication flow

1. The dock app calls `POST /api/auth/start`.
2. The API stores PKCE state server-side and returns a Microsoft authorization URL plus a separate
   one-time polling secret.
3. Microsoft auth can run in regular Safari or another context.
4. `/api/auth/callback` redeems the code and marks the server transaction complete.
5. The original dock app polls `POST /api/auth/complete`; that same-origin response sets its
   HttpOnly session cookie in the correct Safari cookie jar.
6. `/api/token` uses the encrypted server-held MSAL cache to mint short-lived Graph access tokens.

The legacy cookie-bound callback remains temporarily for clients running an older cached service
worker and should be removed after the transaction flow is fully rolled out.

## Build and deploy

The production workflow is `.github/workflows/deploy.yml`. A push to `main`:

1. Installs and builds shared + web with the public client ID embedded.
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
