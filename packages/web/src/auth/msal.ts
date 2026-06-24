import {
  type AccountInfo,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser';
import { CONFIG } from '../config.js';

let pca: PublicClientApplication | undefined;
let account: AccountInfo | null = null;

const scopes = [...CONFIG.graphScopes];

/** Initialize MSAL and resolve any pending redirect. Returns the active account, if any. */
export async function initAuth(): Promise<AccountInfo | null> {
  pca = new PublicClientApplication({
    auth: {
      clientId: CONFIG.clientId,
      authority: CONFIG.authority,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'localStorage' },
  });
  await pca.initialize();

  const result = await pca.handleRedirectPromise();
  account = result?.account ?? pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
  if (account) pca.setActiveAccount(account);
  return account;
}

export function getAccount(): AccountInfo | null {
  return account;
}

export async function signIn(): Promise<void> {
  // Always show the account picker so users can choose their personal MSA
  // instead of silently reusing a work/school SSO session.
  await pca?.loginRedirect({ scopes, prompt: 'select_account' });
}

export async function signOut(): Promise<void> {
  await pca?.logoutRedirect({ account: account ?? undefined });
}

/** Acquire a Graph access token silently; fall back to an interactive redirect if needed. */
export async function getGraphToken(): Promise<string> {
  if (!pca || !account) throw new Error('not signed in');
  try {
    const res = await pca.acquireTokenSilent({ account, scopes });
    return res.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await pca.acquireTokenRedirect({ account, scopes });
    }
    throw err;
  }
}
