import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

function extractStyle(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/i);
  return match ? match[1] : '';
}

describe('no overlap via border-box sizing', () => {
  it('applies global border-box to all elements', () => {
    const html = fs.readFileSync('/Users/andres/Documents/split/index.html', 'utf8');
    const css = extractStyle(html).replace(/\s+/g, ' ');

    // Require a universal border-box rule to ensure widths include padding and border
    expect(css).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box;?[^}]*\}/);
  });
});



