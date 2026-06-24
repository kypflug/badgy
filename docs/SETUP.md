# Deployment runbook — badgy

**Client‑only** SPA: sign‑in is **MSAL** (Microsoft accounts), data is each user's **own OneDrive
app folder** via Microsoft Graph, hosting is **Azure Static Web Apps** (free, global CDN, no cold
start). There is **no backend and no server‑side data store**.

## Prerequisites
- Azure CLI (`az login` — use your **personal** subscription/tenant)
- Node 24, repo built (`npm ci`)

## 1. Register the MSAL public client (one time)

```bash
# Personal tenant; MSA + work/school accounts; PKCE public client (no secret).
APP_ID=$(az ad app create --display-name "badgy" \
  --sign-in-audience AzureADandPersonalMicrosoftAccount \
  --query appId -o tsv)
OBJ_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)

# Register SPA redirect URIs (the SWA host + local dev). Update the host after step 2.
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$OBJ_ID" \
  --headers "Content-Type=application/json" \
  --body '{"spa":{"redirectUris":["https://<swa-host>","http://localhost:5173"]}}'
```

The only delegated scopes the app requests are `User.Read` + `Files.ReadWrite.AppFolder` — it can
read/write **only its own folder** in the user's OneDrive. Each user consents for themselves; no
admin consent and no secret. (Work accounts are subject to *their* tenant's consent policy; personal
Microsoft accounts always work.)

## 2. Create the Static Web App + deploy

```bash
RG="rg-badgy"
az group create -n "$RG" -l westus2 -o none
SWA_HOST=$(az staticwebapp create -n badgy -g "$RG" -l westus2 --sku Free \
  --query defaultHostname -o tsv)
# → re-run the SPA redirect PATCH from step 1 with https://$SWA_HOST

# Build with the client id baked in, then deploy the static output:
MSAL_CLIENT_ID="$APP_ID" MSAL_AUTHORITY="https://login.microsoftonline.com/common" npm run build
TOKEN=$(az staticwebapp secrets list -n badgy -g "$RG" --query "properties.apiKey" -o tsv)
npx -y @azure/static-web-apps-cli deploy ./packages/web/dist --deployment-token "$TOKEN" --env production
```

`packages/web/staticwebapp.config.json` provides the SPA navigation fallback.

## 3. Custom domain (optional, nicer URL)

```bash
az staticwebapp hostname set -n badgy -g rg-badgy --hostname app.example.com
# then add the new origin to the app's spa.redirectUris (step 1 PATCH)
```

## Build‑time config

| Var | Purpose |
|---|---|
| `MSAL_CLIENT_ID` | App (client) ID. Empty → dev mode (mock "remote", no sign‑in). |
| `MSAL_AUTHORITY` | Default `https://login.microsoftonline.com/common` (MSA + work/school). |

## Notes
- **CI:** a GitHub Actions deploy can be added, but the initial push token lacked the `workflow`
  scope. To wire it: `az staticwebapp secrets list … apiKey` → repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN`,
  then a standard `Azure/static-web-apps-deploy` workflow under `.github/workflows/`.
- **Cost:** SWA Free + per‑user OneDrive storage = $0 to operate.
