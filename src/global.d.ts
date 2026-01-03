export {};

declare global {
  interface Window {
    aiServiceReport?: string;
  }

  interface ImportMeta {
    env: Record<string, string | undefined>;
  }
}
