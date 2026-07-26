export type ProviderId = 'microsoft' | 'google';

export interface ProviderAccount {
  id: string;
  name: string;
  email: string;
}

export interface RedeemResult {
  account: ProviderAccount;
  /** Opaque per-provider blob to persist encrypted (MSAL cache JSON, or a refresh token record). */
  cache: string;
}

export interface AccessToken {
  accessToken: string;
  expiresOn: Date | null;
}

export interface AuthProvider {
  readonly id: ProviderId;
  readonly scopes: readonly string[];
  authorizationUrl(opts: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    selectAccount: boolean;
  }): Promise<string>;
  redeem(opts: { code: string; verifier: string; redirectUri: string }): Promise<RedeemResult>;
  /** Refresh silently from the stored cache. Returns the token and the (possibly rotated) cache. */
  accessToken(cache: string): Promise<{ token: AccessToken; cache: string }>;
}
