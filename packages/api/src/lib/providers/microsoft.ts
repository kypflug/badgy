import { cca, GRAPH_SCOPES } from '../auth';
import { StoreError } from '../store';
import type { AuthProvider } from './types';

export const microsoftProvider: AuthProvider = {
  id: 'microsoft',
  scopes: GRAPH_SCOPES,

  async authorizationUrl({ redirectUri, state, codeChallenge, selectAccount }) {
    return cca().getAuthCodeUrl({
      scopes: GRAPH_SCOPES,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod: 'S256',
      ...(selectAccount ? { prompt: 'select_account' } : {}),
    });
  },

  async redeem({ code, verifier, redirectUri }) {
    const client = cca();
    const result = await client.acquireTokenByCode({
      code,
      scopes: GRAPH_SCOPES,
      redirectUri,
      codeVerifier: verifier,
    });
    const account = result.account;
    if (!account) throw new Error('Microsoft did not return an account');
    return {
      account: {
        id: account.homeAccountId,
        name: account.name ?? account.username,
        email: account.username,
      },
      cache: client.getTokenCache().serialize(),
    };
  },

  async accessToken(cache) {
    const client = cca();
    try {
      client.getTokenCache().deserialize(cache);
    } catch (error: unknown) {
      throw new StoreError('corrupt', { cause: error });
    }
    const accounts = await client.getTokenCache().getAllAccounts();
    const account = accounts[0];
    if (!account) {
      const error = new Error('No account found in Microsoft token cache');
      error.name = 'NoAccountError';
      (error as { code?: string }).code = 'no_tokens_found';
      throw error;
    }
    const result = await client.acquireTokenSilent({ account, scopes: GRAPH_SCOPES });
    return {
      token: { accessToken: result.accessToken, expiresOn: result.expiresOn },
      cache: client.getTokenCache().serialize(),
    };
  },
};
