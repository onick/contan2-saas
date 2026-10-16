// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractImageUrls } from './warm-images.mjs';

describe('extractImageUrls', () => {
  it('toma src y cada entrada de srcset de /_next/image, decodifica &amp; y deduplica', () => {
    const html = `<img src="/_next/image?url=%2Fa.png&amp;w=1920&amp;q=75" srcset="/_next/image?url=%2Fa.png&amp;w=640&amp;q=75 640w, /_next/image?url=%2Fa.png&amp;w=828&amp;q=75 828w"/>
      <link rel="preload" as="image" imagesrcset="/_next/image?url=%2Fa.png&amp;w=640&amp;q=75 640w"/>
      <img src="/otra.png"/>`;
    expect(extractImageUrls(html)).toEqual([
      '/_next/image?url=%2Fa.png&w=1920&q=75',
      '/_next/image?url=%2Fa.png&w=640&q=75',
      '/_next/image?url=%2Fa.png&w=828&q=75',
    ]);
  });
});
