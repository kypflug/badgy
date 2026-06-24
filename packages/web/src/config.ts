/** Build-time configuration (injected by esbuild `define`). */
export const CONFIG = {
  /** MSAL public-client app (client) ID. Empty in dev until the app is registered. */
  clientId: __MSAL_CLIENT_ID__,
  /** Authority — `common` admits both personal Microsoft accounts and work/school accounts. */
  authority: __MSAL_AUTHORITY__,
  /** Delegated Graph scopes: read the signed-in user + read/write only our own OneDrive app folder. */
  graphScopes: ['User.Read', 'Files.ReadWrite.AppFolder'],
} as const;
