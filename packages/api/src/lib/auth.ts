import { ConfidentialClientApplication } from '@azure/msal-node';

/** Graph delegated scopes — read the user + read/write only this app's OneDrive folder. */
export const GRAPH_SCOPES = ['User.Read', 'Files.ReadWrite.AppFolder'];

/**
 * A fresh confidential-client app per request. We load/save the per-user MSAL token cache
 * around each call (see store.ts), so instances stay isolated between users.
 */
export function cca(): ConfidentialClientApplication {
  const clientId = process.env.MSAL_CLIENT_ID;
  const clientSecret = process.env.MSAL_CLIENT_SECRET;
  const authority = process.env.MSAL_AUTHORITY ?? 'https://login.microsoftonline.com/consumers';
  if (!clientId || !clientSecret)
    throw new Error('MSAL_CLIENT_ID / MSAL_CLIENT_SECRET not configured');
  return new ConfidentialClientApplication({ auth: { clientId, clientSecret, authority } });
}
