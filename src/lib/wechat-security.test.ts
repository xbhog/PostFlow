import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { sanitizePublicationHtml } = require('../../electron/publishers/publication-html.cjs');
const {
  RemoteImageService,
  MAX_IMAGE_BYTES,
  validateRemoteUrl
} = require('../../electron/publishers/remote-image-service.cjs');
const { WeChatTokenService } = require('../../electron/publishers/wechat-token-service.cjs');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const fakeDispatcher = () => ({ close: async () => undefined });

describe('公众号发布安全边界', () => {
  it('清除实体编码协议、SVG 和危险样式', () => {
    const output = sanitizePublicationHtml(`
      <p onclick="alert(1)" style="color:red;background:url(javascript:alert(1))">正文</p>
      <a href="java&#x73;cript:alert(1)">危险链接</a>
      <svg><a xlink:href="javascript:alert(1)">svg</a></svg>
      <img src="java&#115;cript:alert(1)" onerror="alert(1)">
    `);

    expect(output).toContain('正文');
    expect(output).not.toMatch(/javascript|onclick|onerror|<svg|background\s*:/i);
  });

  it('远程图片按流式字节上限提前中止', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(chunk);
      }
    });
    const service = new RemoteImageService({
      fetchImpl: vi.fn(async () => new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      })),
      lookupImpl: publicLookup,
      dispatcherFactory: fakeDispatcher
    });

    await expect(service.download('https://images.example.com/large.png'))
      .rejects.toMatchObject({ code: 'WECHAT_IMAGE_DOWNLOAD_FAILED' });
  });

  it('拒绝解析到内网、保留地址或 IPv4 映射 IPv6 的图片域名', async () => {
    for (const address of ['10.0.0.1', '100.64.0.1', '198.18.0.1', '203.0.113.9', '::ffff:192.168.1.2']) {
      await expect(validateRemoteUrl(
        'https://images.example.com/test.png',
        async () => [{ address, family: address.includes(':') ? 6 : 4 }]
      )).rejects.toMatchObject({ code: 'WECHAT_IMAGE_DOWNLOAD_FAILED' });
    }
  });

  it('测试未保存凭证不会污染正式账号 Token 缓存', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      const secret = url.searchParams.get('secret');
      return new Response(JSON.stringify({
        access_token: `token-${secret}`,
        expires_in: 7200
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });
    const service = new WeChatTokenService({ fetchImpl });
    const stored = { id: 'same-id', appId: 'wxstored', appSecret: 'stored-secret' };
    const edited = { id: 'same-id', appId: 'wxedited', appSecret: 'edited-secret' };

    expect(await service.getAccessToken(stored)).toBe('token-stored-secret');
    expect(await service.testAccessToken(edited)).toBe('token-edited-secret');
    expect(await service.getAccessToken(stored)).toBe('token-stored-secret');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('并发刷新共用同一个请求', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const service = new WeChatTokenService({ fetchImpl });
    const account = { id: 'account', appId: 'wxaccount', appSecret: 'secret' };
    const first = service.getAccessToken(account);
    const second = service.getAccessToken(account);
    resolveFetch(new Response(JSON.stringify({ access_token: 'shared', expires_in: 7200 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(Promise.all([first, second])).resolves.toEqual(['shared', 'shared']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('导出的图片上限保持为 10 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  });
});
