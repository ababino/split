import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

function extractStyle(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/i);
  return match ? match[1] : '';
}

describe('responsive layout', () => {
  it('uses flexible grid columns and allows inputs to shrink on small screens', () => {
    const html = fs.readFileSync('/Users/andres/Documents/split/index.html', 'utf8');
    const css = extractStyle(html);

    // Grid columns should be flexible with minmax for the name column
    expect(css).toMatch(/grid-template-columns:[^{}]*minmax\(0,\s*1fr\)/);

    // Should not rely on three fixed tracks (like "1fr 160px 100px") anymore
    expect(css.includes('grid-template-columns: 1fr 160px 100px')).toBe(false);

    // Grid children should be allowed to shrink within their tracks
    expect(css).toMatch(/\.row\s*>\s*\*\s*\{\s*min-width:\s*0;\s*\}/);

    // Small screens should reduce button padding for better fit
    expect(css).toMatch(/@media\s*\(max-width:[^)]+\)\s*\{[\s\S]*?button\s*\{[\s\S]*?padding:\s*6px\s+8px;[\s\S]*?\}[\s\S]*?\}/);
  });
});




