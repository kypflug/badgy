// Ambient module declarations for esbuild asset imports.
declare module '*.css';
declare module '*.svg' {
  const content: string;
  export default content;
}

// Build-time constants injected by esbuild `define`.
declare const __MSAL_CLIENT_ID__: string;
declare const __MSAL_AUTHORITY__: string;
declare const __GOOGLE_ENABLED__: boolean;
