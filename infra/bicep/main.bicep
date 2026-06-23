// Hybrid Attendance Modeler (badgy) — App Service + Storage (Table) for the RTO/BELT planner.
//
// Deploys: a Linux App Service plan + Web App (Node), a Storage Account whose
// connection string is injected as an app setting, and a system-assigned identity
// (kept for the Managed-Identity hardening path documented in docs/SETUP.md).
//
// Easy Auth (Microsoft Entra) is configured AFTER deploy via `az webapp auth …`
// because the AAD app registration + sign-in audience is an interactive decision
// (see docs/SETUP.md).

@description('Base name; used for the web app host (must be globally unique) and resources.')
param appName string

@description('Azure region.')
param location string = resourceGroup().location

@description('App Service plan SKU. B1 is the cheapest always-on tier; F1 is free.')
param sku string = 'B1'

@description('Node runtime for App Service (Linux).')
param nodeVersion string = 'NODE|20-lts'

@description('Comma-separated emails allowed to access data (empty = any authenticated identity).')
param allowedEmails string = ''

@description('Comma-separated email domains allowed (e.g. microsoft.com). Empty = no domain gate.')
param allowedEmailDomains string = ''

var storageName = toLower(take('st${replace(appName, '-', '')}${uniqueString(resourceGroup().id)}', 24))

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  sku: { name: sku }
  kind: 'linux'
  properties: { reserved: true }
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: nodeVersion
      alwaysOn: sku != 'F1'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appCommandLine: 'node index.js'
      appSettings: [
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '0' }
        { name: 'NODE_ENV', value: 'production' }
        { name: 'AZURE_STORAGE_CONNECTION_STRING', value: storageConnectionString }
        { name: 'AZURE_STORAGE_ACCOUNT', value: storage.name }
        { name: 'ALLOWED_EMAILS', value: allowedEmails }
        { name: 'ALLOWED_EMAIL_DOMAINS', value: allowedEmailDomains }
      ]
    }
  }
}

output webAppName string = web.name
output webAppHostname string = web.properties.defaultHostName
output storageAccount string = storage.name
output principalId string = web.identity.principalId
