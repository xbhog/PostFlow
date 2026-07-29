import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeWeChatCompatible } from './wechatCompat';

const sourceUrl = 'https://images.example.com/test.png';

describe('makeWeChatCompatible image modes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves remote image URLs for API draft publishing', async () => {
    const html = `<div><p>正文</p><img src="${sourceUrl}" alt="测试图"></div>`;
    const output = await makeWeChatCompatible(html, 'mac', { convertImagesToBase64: false });

    expect(output).toContain(sourceUrl);
    expect(output).not.toContain('data:image/');
  });

  it('converts remote image URLs by default for clipboard copying', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      bytes,
      { status: 200, headers: { 'Content-Type': 'image/png' } }
    )));

    const html = `<div><img src="${sourceUrl}" alt="测试图"></div>`;
    const output = await makeWeChatCompatible(html, 'mac');

    expect(output).toContain('data:image/png;base64,');
    expect(output).not.toContain(sourceUrl);
  });
});
