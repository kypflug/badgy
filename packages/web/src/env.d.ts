// Ambient module declarations for esbuild asset imports.
declare module '*.css';
declare module '*.svg' {
  const content: string;
  export default content;
}
