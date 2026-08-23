import { describe, expect, it } from 'vitest';
import { locateRenderedBlock } from './editorLocate';

function render(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('locateRenderedBlock', () => {
  it('finds a heading by visible text', () => {
    const root = render('<h1>定位标题</h1><p>第一段</p>');
    expect(locateRenderedBlock(root, { type: 'heading', text: '# 定位标题' })?.tagName).toBe('H1');
  });

  it('finds an image by src', () => {
    const root = render('<p><img alt="封面" src="https://mock-assets.postflow.local/cover.png"></p>');
    expect(locateRenderedBlock(root, {
      type: 'image',
      src: 'https://mock-assets.postflow.local/cover.png',
      alt: '封面'
    })?.getAttribute('src')).toBe('https://mock-assets.postflow.local/cover.png');
  });
});
