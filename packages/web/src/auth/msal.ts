import {
  type AccountInfo,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser';
import { CONFIG } from '../config.js';

let pca: PublicClientApplication | undefined;
let account: AccountInfo | null = null;

const scopes = [...CONFIG.graphScopes];

/** Thrown by getGraphToken when the silent session has lapsed and interactive re-auth is needed. */
export const AUTH_INTERACTION_REQUIRED = 'auth_interaction_required';

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

/**
 * User-initiated interactive re-auth, after the silent session lapses (common on iOS/Safari,
 * where ITP blocks the hidden-iframe SSO renewal). Triggered by an explicit tap — never
 * automatically — so opening the app never force-redirects to a login page.
 */
export async function reconnect(): Promise<void> {
  if (account) await pca?.acquireTokenRedirect({ account, scopes });
  else await signIn();
}

/**
 * Acquire a Graph access token *silently only*. On failure we surface AUTH_INTERACTION_REQUIRED
 * and let the app keep running on cached data; re-auth happens on an explicit user gesture
 * (see reconnect()) rather than an automatic redirect on every launch.
 */
export async function getGraphToken(): Promise<string> {
  if (!pca || !account) throw new Error(AUTH_INTERACTION_REQUIRED);
  try {
    const res = await pca.acquireTokenSilent({ account, scopes });
    return res.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) throw new Error(AUTH_INTERACTION_REQUIRED);
    throw err;
  }
}
