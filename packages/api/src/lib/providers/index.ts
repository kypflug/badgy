import { googleProvider } from './google';
import { microsoftProvider } from './microsoft';
import type { AuthProvider, ProviderId } from './types';

export const DEFAULT_PROVIDER: ProviderId = 'microsoft';

export function isProviderId(v: unknown): v is ProviderId {
  return v === 'microsoft' || v === 'google';
}

export function getProvider(id: ProviderId): AuthProvider {
  return id === 'google' ? googleProvider : microsoftProvider;
}

export type { AccessToken, AuthProvider, ProviderAccount, ProviderId, RedeemResult } from './types';
