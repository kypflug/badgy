/** Build-time configuration (injected by esbuild `define`). */
export const CONFIG = {
  /** MSAL public-client app (client) ID. Empty in dev until the app is registered. */
  clientId: __MSAL_CLIENT_ID__,
  /** Authority — `consumers` admits personal Microsoft accounts only (no work/school). */
  authority: __MSAL_AUTHORITY__,
  /**
   * Whether to offer Google sign-in. Off until the Google OAuth client exists and the
   * `drive.appdata` scope is verified; the Drive transport and BFF provider ship regardless, so
   * turning this on is a build-flag change, not a code change. An existing Google session keeps
   * working even when this is false.
   */
  googleEnabled: __GOOGLE_ENABLED__,
  /** Delegated Graph scopes: read the signed-in user + read/write only our own OneDrive app folder. */
  graphScopes: ['User.Read', 'Files.ReadWrite.AppFolder'],
} as const;
