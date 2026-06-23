# Deployment runbook

Deploys **badgy** (the Hybrid Attendance Modeler) to **Azure App Service** (Node, Linux) with
**Azure Table Storage** for per-user data and **Easy Auth** (Microsoft Entra) for sign-in.

The app is a single Node process that serves the built SPA *and* the REST API. Persistence picks a
backend from env: a storage **connection string** or **account + Managed Identity**, else local files.

## Prerequisites

- Azure CLI (`az`) logged in: `az login`
- An Azure subscription you can create resources in
- Node 24 + this repo built (`npm ci`)

## 1. Provision + deploy (one pass)

```bash
# --- choose your names/sub/region ---
SUB="<subscription-id-or-name>"        # e.g. the Visual Studio Enterprise sub
RG="rg-badgy"
LOCATION="westus2"
APP="badgy-<unique-suffix>"            # global; becomes https://<APP>.azurewebsites.net

az account set --subscription "$SUB"
az group create -n "$RG" -l "$LOCATION" -o none

# Infra: App Service plan + Web App + Storage (+ connection-string app setting)
az deployment group create -g "$RG" \
  --template-file infra/bicep/main.bicep \
  --parameters appName="$APP" location="$LOCATION" \
  -o none

# Build + package the self-contained artifact, then deploy it
bash scripts/package-app.sh
az webapp deploy -g "$RG" -n "$APP" --src-path dist-deploy.zip --type zip -o none

echo "→ https://$APP.azurewebsites.net"
```

## 2. Sign-in (Easy Auth) — pick one

### Option A — Private to you (fastest; personal account / your tenant)

Registers an app and turns on Easy Auth in **anonymous-allowed** mode (the public page works in
local-only mode; *data* is gated to your accounts by `ALLOWED_EMAILS`).

```bash
APP_HOST="$APP.azurewebsites.net"
APP_ID=$(az ad app create --display-name "badgy" \
  --sign-in-audience AzureADandPersonalMicrosoftAccount \
  --web-redirect-uris "https://$APP_HOST/.auth/login/aad/callback" \
  --query appId -o tsv)
SECRET=$(az ad app credential reset --id "$APP_ID" --query password -o tsv)

az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  MICROSOFT_PROVIDER_AUTHENTICATION_SECRET="$SECRET" \
  ALLOWED_EMAILS="kyle.pflug@live.com,kypflug@microsoft.com"

az webapp auth microsoft update -g "$RG" -n "$APP" \
  --client-id "$APP_ID" \
  --client-secret-setting-name MICROSOFT_PROVIDER_AUTHENTICATION_SECRET \
  --issuer "https://login.microsoftonline.com/common/v2.0" --yes -o none

# Allow anonymous (public page); the app gates data via ALLOWED_EMAILS.
az webapp auth update -g "$RG" -n "$APP" --enabled true \
  --action AllowAnonymous --redirect-provider azureactivedirectory -o none
```

Sign in from the app via `https://$APP_HOST/.auth/login/aad`; sign out via `/.auth/logout`.

### Option B — Open to all Microsoft employees (the real goal)

Register the auth app in the **Microsoft corporate tenant** so only `@microsoft.com` users can sign in.

```bash
# Log in to the corporate tenant for the app registration (your @microsoft.com identity):
az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47 --allow-no-subscriptions

APP_HOST="$APP.azurewebsites.net"
APP_ID=$(az ad app create --display-name "badgy" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "https://$APP_HOST/.auth/login/aad/callback" \
  --query appId -o tsv)
SECRET=$(az ad app credential reset --id "$APP_ID" --query password -o tsv)

# Back to the hosting subscription/tenant to configure the site:
az account set --subscription "$SUB"
az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  MICROSOFT_PROVIDER_AUTHENTICATION_SECRET="$SECRET" \
  ALLOWED_EMAIL_DOMAINS="microsoft.com"

az webapp auth microsoft update -g "$RG" -n "$APP" \
  --client-id "$APP_ID" \
  --client-secret-setting-name MICROSOFT_PROVIDER_AUTHENTICATION_SECRET \
  --issuer "https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0" --yes -o none

az webapp auth update -g "$RG" -n "$APP" --enabled true \
  --action RedirectToLoginPage --redirect-provider azureactivedirectory -o none
```

> Single-tenant (`AzureADMyOrg`) already restricts sign-in to `microsoft.com`; `ALLOWED_EMAIL_DOMAINS`
> is belt-and-suspenders. The first sign-in may require **tenant admin consent** for the app — if so,
> have an admin grant consent (the app only requests basic sign-in/openid).

## 3. CI deploys via GitHub Actions (optional)

`.github/workflows/deploy.yml` deploys on push to `main` using OIDC (no stored passwords):

```bash
# Federated credential so the repo can get tokens for the deploy app identity:
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:kypflug/badgy:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
# Give that identity contributor on the resource group, then set repo secrets/vars:
#   secrets: AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID
#   vars:    AZURE_WEBAPP_NAME = <APP>
```

## Hardening — Managed Identity for storage (no connection string)

The web app has a system-assigned identity. To drop the storage key:

```bash
PRINCIPAL=$(az webapp identity show -g "$RG" -n "$APP" --query principalId -o tsv)
STORAGE_ID=$(az storage account show -g "$RG" -n <storageName> --query id -o tsv)
az role assignment create --assignee "$PRINCIPAL" \
  --role "Storage Table Data Contributor" --scope "$STORAGE_ID"
# then remove AZURE_STORAGE_CONNECTION_STRING (the app falls back to AZURE_STORAGE_ACCOUNT + MI)
az webapp config appsettings delete -g "$RG" -n "$APP" --setting-names AZURE_STORAGE_CONNECTION_STRING
```

## Environment variables

| Setting | Purpose |
|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Table Storage (also Azurite). Wins over account+MI. |
| `AZURE_STORAGE_ACCOUNT` | Storage account for Managed-Identity access. |
| `ALLOWED_EMAILS` | Exact emails allowed (comma-separated). |
| `ALLOWED_EMAIL_DOMAINS` | Allowed email domains, e.g. `microsoft.com`. |
| `DEV_USER` | Local only: pretend to be this signed-in user. |
| `PORT` | Listen port (App Service sets this). |
| `WEB_DIST` | Path to the built SPA (defaults to `./web`). |
