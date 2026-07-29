import type { WorkspaceBridge } from '../types/article';
import { createBrowserBridge } from './browser-workspace';

export const workspaceClient: WorkspaceBridge = window.draftdock ?? createBrowserBridge();
