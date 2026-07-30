import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { sanitizePublicationHtml } = require('../../electron/publishers/publication-html.cjs');
const {
  RemoteImageService,
  MAX_IMAGE_BYTES,
  DOWNLOAD_TIMEOUT_MS,
  createPinnedLookup,
  validateRemoteUrl
} = require('../../electron/publishers/remote-image-service.cjs');
const { WeChatTokenService } = require('../../electron/publishers/wechat-token-service.cjs');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const fakeDispatcher = () => ({ close: async () => undefined });

describe('公众号发布安全边界', () => {
  it('Electron 主进程运行时可以加载远程图片服务', () => {
    const electronPath = require('electron') as string;
    const servicePath = require.resolve('../../electron/publishers/remote-image-service.cjs');
    const result = spawnSync(electronPath, ['-e', `require(${JSON.stringify(servicePath)})`], {
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('DNS 固定回调兼容 Node 的全地址查询协议', async () => {
    const selected = { address: '93.184.216.34', family: 4 };
    const lookup = createPinnedLookup([selected]);

    await new Promise<void>((resolve, reject) => {
      lookup('images.example.com', { all: true }, (
        error: Error | null,
        addresses: Array<{ address: string; family: number }>
      ) => {
        if (error) {
          reject(error);
          return;
        }
        expect(addresses).toEqual([selected]);
        resolve();
      });
    });
  });

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

  it('允许正常图片请求超过 15 秒但仍受下载超时保护', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url, options: { signal: AbortSignal }) => (
        new Promise<Response>((resolve, reject) => {
          const responseTimer = setTimeout(() => {
            resolve(new Response(new Uint8Array([1, 2, 3]), {
              status: 200,
              headers: { 'Content-Type': 'image/png' }
            }));
          }, 16_000);
          options.signal.addEventListener('abort', () => {
            clearTimeout(responseTimer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }, { once: true });
        })
      ));
      const service = new RemoteImageService({
        fetchImpl,
        lookupImpl: publicLookup,
        dispatcherFactory: fakeDispatcher
      });

      const download = service.download('https://images.example.com/slow.png');
      await vi.advanceTimersByTimeAsync(16_000);

      await expect(download).resolves.toMatchObject({
        mimeType: 'image/png',
        filename: 'slow.png'
      });
      expect(DOWNLOAD_TIMEOUT_MS).toBe(60_000);
    } finally {
      vi.useRealTimers();
    }
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
