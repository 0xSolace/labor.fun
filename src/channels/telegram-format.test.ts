import { describe, it, expect } from 'vitest';

import {
  escapeHtml,
  htmlToPlainText,
  markdownToTelegramHtml,
  splitTelegramHtmlChunks,
} from './telegram-format.js';

// --- escapeHtml ---

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('escapes & first so entities are not double-broken', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('passes plain text through', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

// --- markdownToTelegramHtml ---

describe('markdownToTelegramHtml', () => {
  it('escapes raw HTML in text (no injection)', () => {
    expect(markdownToTelegramHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes & in text', () => {
    expect(markdownToTelegramHtml('bread & butter')).toBe('bread &amp; butter');
  });

  it('converts **bold**', () => {
    expect(markdownToTelegramHtml('a **bold** move')).toBe(
      'a <b>bold</b> move',
    );
  });

  it('converts __bold__', () => {
    expect(markdownToTelegramHtml('__bold__')).toBe('<b>bold</b>');
  });

  it('converts *italic* and _italic_', () => {
    expect(markdownToTelegramHtml('*it* and _al_')).toBe(
      '<i>it</i> and <i>al</i>',
    );
  });

  it('does not italicize snake_case identifiers', () => {
    expect(
      markdownToTelegramHtml('use chat_id and message_thread_id here'),
    ).toBe('use chat_id and message_thread_id here');
  });

  it('converts ~~strikethrough~~', () => {
    expect(markdownToTelegramHtml('~~gone~~')).toBe('<s>gone</s>');
  });

  it('converts ||spoiler||', () => {
    expect(markdownToTelegramHtml('||secret||')).toBe(
      '<tg-spoiler>secret</tg-spoiler>',
    );
  });

  it('converts nested bold+italic', () => {
    expect(markdownToTelegramHtml('**bold *and italic***')).toBe(
      '<b>bold <i>and italic</i></b>',
    );
  });

  it('converts `inline code` and escapes its content', () => {
    expect(markdownToTelegramHtml('run `a < b && c > d`')).toBe(
      'run <code>a &lt; b &amp;&amp; c &gt; d</code>',
    );
  });

  it('does not style markdown inside inline code', () => {
    expect(markdownToTelegramHtml('`**not bold**`')).toBe(
      '<code>**not bold**</code>',
    );
  });

  it('converts fenced code blocks with escaping', () => {
    const md = '```\nif (a < b && c > d) {}\n```';
    expect(markdownToTelegramHtml(md)).toBe(
      '<pre><code>if (a &lt; b &amp;&amp; c &gt; d) {}</code></pre>',
    );
  });

  it('adds language class to fenced code blocks', () => {
    const md = '```ts\nconst x = 1;\n```';
    expect(markdownToTelegramHtml(md)).toBe(
      '<pre><code class="language-ts">const x = 1;</code></pre>',
    );
  });

  it('does not style markdown inside code blocks', () => {
    const md = '```\n**bold** _it_ [l](https://x.com)\n```';
    expect(markdownToTelegramHtml(md)).toBe(
      '<pre><code>**bold** _it_ [l](https://x.com)</code></pre>',
    );
  });

  it('closes an unterminated fence', () => {
    const md = '```\ncode';
    expect(markdownToTelegramHtml(md)).toBe('<pre><code>code</code></pre>');
  });

  it('converts [label](url) links', () => {
    expect(
      markdownToTelegramHtml('see [docs](https://example.com/a?b=1)'),
    ).toBe('see <a href="https://example.com/a?b=1">docs</a>');
  });

  it('does not mangle underscores in link URLs', () => {
    expect(
      markdownToTelegramHtml('[x](https://example.com/some_page_here)'),
    ).toBe('<a href="https://example.com/some_page_here">x</a>');
  });

  it('leaves non-http(s) link schemes as literal text', () => {
    expect(markdownToTelegramHtml('[x](javascript:alert(1))')).toBe(
      '[x](javascript:alert(1))',
    );
  });

  it('escapes quotes in link hrefs', () => {
    const out = markdownToTelegramHtml('[x](https://e.com/a"b)');
    expect(out).toBe('<a href="https://e.com/a&quot;b">x</a>');
  });

  it('styles link labels', () => {
    expect(markdownToTelegramHtml('[**bold**](https://e.com)')).toBe(
      '<a href="https://e.com"><b>bold</b></a>',
    );
  });

  it('renders headings as bold (telegram has no heading tag)', () => {
    expect(markdownToTelegramHtml('# Title\n## Sub')).toBe(
      '<b>Title</b>\n<b>Sub</b>',
    );
  });

  it('renders bullet lists as plain "- " lines', () => {
    expect(markdownToTelegramHtml('- one\n* two\n+ three')).toBe(
      '- one\n- two\n- three',
    );
  });

  it('preserves list indentation and styles items', () => {
    expect(markdownToTelegramHtml('  - **x**')).toBe('  - <b>x</b>');
  });

  it('renders ordered lists as plain numbered lines', () => {
    expect(markdownToTelegramHtml('1. one\n2. two')).toBe('1. one\n2. two');
  });

  it('converts > blockquotes and merges adjacent lines', () => {
    expect(markdownToTelegramHtml('> line one\n> line two')).toBe(
      '<blockquote>line one\nline two</blockquote>',
    );
  });

  it('styles inside blockquotes', () => {
    expect(markdownToTelegramHtml('> **bold** quote')).toBe(
      '<blockquote><b>bold</b> quote</blockquote>',
    );
  });

  it('handles empty input', () => {
    expect(markdownToTelegramHtml('')).toBe('');
  });

  it('preserves plain multi-line text', () => {
    expect(markdownToTelegramHtml('one\n\ntwo')).toBe('one\n\ntwo');
  });
});

// --- htmlToPlainText (fallback stripping) ---

describe('htmlToPlainText', () => {
  it('strips tags and unescapes entities', () => {
    expect(htmlToPlainText('<b>bold</b> &amp; <code>a &lt; b</code>')).toBe(
      'bold & a < b',
    );
  });

  it('round-trips markdown text content', () => {
    const md = 'a **bold** & `x < y` [link](https://e.com)';
    const html = markdownToTelegramHtml(md);
    expect(htmlToPlainText(html)).toBe('a bold & x < y link');
  });

  it('strips pre/code wrappers', () => {
    expect(
      htmlToPlainText(
        '<pre><code class="language-ts">const x = 1;</code></pre>',
      ),
    ).toBe('const x = 1;');
  });
});

// --- splitTelegramHtmlChunks ---

describe('splitTelegramHtmlChunks', () => {
  it('returns single chunk when within limit', () => {
    expect(splitTelegramHtmlChunks('<b>hi</b>', 4096)).toEqual(['<b>hi</b>']);
  });

  it('returns empty array for empty input', () => {
    expect(splitTelegramHtmlChunks('', 4096)).toEqual([]);
  });

  it('splits long plain text into chunks within the limit', () => {
    const text = 'word '.repeat(2000).trim(); // 9999 chars
    const chunks = splitTelegramHtmlChunks(text, 4096);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(4096);
    }
    // No content lost beyond boundary whitespace.
    expect(chunks.join(' ').split(/\s+/).length).toBe(2000);
  });

  it('prefers paragraph boundaries', () => {
    const para = 'a'.repeat(3000);
    const text = `${para}\n\n${'b'.repeat(3000)}`;
    const chunks = splitTelegramHtmlChunks(text, 4096);
    expect(chunks[0]).toBe(para);
    expect(chunks[1]).toBe('b'.repeat(3000));
  });

  it('never splits mid-tag and reopens styling across chunks', () => {
    const inner = 'x'.repeat(5000);
    const html = `<b>${inner}</b>`;
    const chunks = splitTelegramHtmlChunks(html, 4096);
    expect(chunks.length).toBe(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(4096);
      expect(c.startsWith('<b>')).toBe(true);
      expect(c.endsWith('</b>')).toBe(true);
      // Balanced: no dangling '<'
      expect((c.match(/<b>/g) || []).length).toBe(
        (c.match(/<\/b>/g) || []).length,
      );
    }
    expect(chunks.map((c) => c.slice(3, -4)).join('')).toBe(inner);
  });

  it('does not split inside an HTML entity', () => {
    const text = `${'a'.repeat(4090)}&amp;more text`;
    const chunks = splitTelegramHtmlChunks(text, 4096);
    for (const c of chunks) {
      // No chunk ends with a broken entity like '&am'
      expect(/&#?[a-zA-Z0-9]{0,9}$/.test(c) && !/;$/.test(c)).toBe(false);
    }
    expect(chunks.join('')).toContain('&amp;');
  });

  it('handles pre/code blocks across chunks', () => {
    const code = 'line\n'.repeat(1200); // 6000 chars
    const html = `<pre><code>${code}</code></pre>`;
    const chunks = splitTelegramHtmlChunks(html, 4096);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(4096);
      expect(c.startsWith('<pre><code>')).toBe(true);
      expect(c.endsWith('</code></pre>')).toBe(true);
    }
  });
});
