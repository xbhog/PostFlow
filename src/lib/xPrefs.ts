const X_PREFS_KEY = 'draftdock:x-publish-prefs:v1';

export type PublishChannel = 'wechat' | 'x';

export interface XPublishPrefs {
  hasPremium: boolean;
  lastChannel: PublishChannel;
}

const DEFAULT_PREFS: XPublishPrefs = {
  hasPremium: true,
  lastChannel: 'wechat'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function readXPublishPrefs(): XPublishPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(localStorage.getItem(X_PREFS_KEY) || 'null');
    if (!isRecord(parsed)) return { ...DEFAULT_PREFS };
    return {
      hasPremium: parsed.hasPremium !== false,
      lastChannel: parsed.lastChannel === 'x' ? 'x' : 'wechat'
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeXPublishPrefs(prefs: Partial<XPublishPrefs>) {
  if (typeof localStorage === 'undefined') return;
  const current = readXPublishPrefs();
  localStorage.setItem(X_PREFS_KEY, JSON.stringify({
    hasPremium: prefs.hasPremium ?? current.hasPremium,
    lastChannel: (prefs.lastChannel ?? current.lastChannel) === 'x' ? 'x' : 'wechat'
  }));
}
