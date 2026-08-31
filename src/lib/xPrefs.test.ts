import { describe, expect, it } from 'vitest';
import { readXPublishPrefs, writeXPublishPrefs } from './xPrefs';

describe('xPrefs', () => {
  it('defaults to premium and persists the free-account choice', () => {
    localStorage.clear();
    expect(readXPublishPrefs()).toEqual({ hasPremium: true, lastChannel: 'wechat' });
    writeXPublishPrefs({ hasPremium: false, lastChannel: 'x' });
    expect(readXPublishPrefs()).toEqual({ hasPremium: false, lastChannel: 'x' });
  });
});
