import type { WorkspaceBridge } from './article';

declare global {
  interface Window {
    draftdock?: WorkspaceBridge;
  }
}

export {};
