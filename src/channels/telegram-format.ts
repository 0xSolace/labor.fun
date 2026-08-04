/**
 * Markdown → Telegram HTML conversion for outbound messages.
 *
 * Modeled on openclaw/hermes's telegram formatter design:
 * - escape-first: all text nodes are HTML-escaped (&, <, >) BEFORE any
 *   whitelisted tags are introduced, so agent output can never inject markup.
 * - whitelist of tags Telegram's HTML parse_mode supports:
 *     <b> <i> <s> <code> <pre> <a> <tg-spoiler> <blockquote>
 * - safe fallback at send time: if Telegram rejects the HTML (400 can't
 *   parse entities), callers resend as plain text — see telegram.ts.
 *
 * Markdown supported:
 *   **bold** / __bold__        → <b>
 *   *italic* / _italic_        → <i>
 *   ~~strike~~                 → <s>
 *   ||spoiler||                → <tg-spoiler>
 *   `inline code`              → <code>
 *   ``` fenced blocks ```      → <pre><code class="language-x">
 *   [label](https://url)       → <a href="url">
 *   # headings                 → <b> (Telegram has no heading tag)
 *   - / * / + / 1. lists       → plain "- " / "1. " lines
 *   > blockquotes              → <blockquote>
 */

// eslint-disable-next-line no-control-regex -- \u0000 cannot appear in agent text; safe placeholder sentinel
const PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;

/** Escape &, <, > so text is safe inside Telegram HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

/** Only linkify schemes Telegram accepts; anything else stays literal text. */
const LINKABLE_HREF_RE = /^(https?:\/\/|tg:\/\/|mailto:)/i;

/**
 * Inline styles applied to already-escaped text. Runs AFTER code spans and
 * links have been stashed as placeholders, so URLs/snake_case inside them
 * are never mangled.
 */
function applyInlineStyles(text: string): string {
  return (
    text
      // Same-delimiter nesting: ***both***, **bold *italic***, ***italic* bold**
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<b><i>$1</i></b>')
      .replace(/\*\*([^*\n]*)\*([^*\n]+)\*\*\*/g, '<b>$1<i>$2</i></b>')
      .replace(/\*\*\*([^*\n]+)\*([^*\n]*)\*\*/g, '<b><i>$1</i>$2</b>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_\n]+)__/g, '<b>$1</b>')
      .replace(/(?<![\w*])\*(\S(?:[^*\n]*\S)?)\*(?![\w*])/g, '<i>$1</i>')
      .replace(/(?<![\w_])_(\S(?:[^_\n]*\S)?)_(?![\w_])/g, '<i>$1</i>')
      .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
      .replace(/\|\|([^|\n]+)\|\|/g, '<tg-spoiler>$1</tg-spoiler>')
  );
}

/** Convert one line of inline markdown to Telegram HTML. */
function convertInline(text: string): string {
  const placeholders: string[] = [];
  const stash = (html: string): string => {
    placeholders.push(html);
    return `\u0000${placeholders.length - 1}\u0000`;
  };

  // 1. Inline code spans first — content is escaped verbatim, never styled.
  let work = text.replace(/`([^`\n]+)`/g, (_m, code: string) =>
    stash(`<code>${escapeHtml(code)}</code>`),
  );

  // 2. Escape everything else.
  work = escapeHtml(work);

  // 3. Links — href is attr-escaped, label gets inline styles. Stashed so
  //    style regexes can't corrupt URLs (underscores etc).
  work = work.replace(
    /\[([^\]\n]*)\]\(([^()\s]+)\)/g,
    (m, label: string, href: string) => {
      if (!label || !LINKABLE_HREF_RE.test(href)) return m;
      return stash(
        `<a href="${href.replace(/"/g, '&quot;')}">${applyInlineStyles(label)}</a>`,
      );
    },
  );

  // 4. Bold/italic/strike/spoiler on what remains.
  work = applyInlineStyles(work);

  // 5. Restore placeholders (loop: links can contain code placeholders).
  let prev: string;
  do {
    prev = work;
    work = work.replace(
      PLACEHOLDER_RE,
      (_m, i: string) => placeholders[Number(i)] ?? '',
    );
  } while (work !== prev);
  return work;
}

/** Convert a markdown message to Telegram-safe HTML (parse_mode: 'HTML'). */
export function markdownToTelegramHtml(markdown: string): string {
  const lines = (markdown ?? '').split('\n');
  const out: string[] = [];
  let inFence = false;
  let fenceLang = '';
  let fenceLines: string[] = [];
  let quoteLines: string[] | null = null;

  const flushQuote = () => {
    if (quoteLines) {
      out.push(`<blockquote>${quoteLines.join('\n')}</blockquote>`);
      quoteLines = null;
    }
  };
  const flushFence = () => {
    const code = escapeHtml(fenceLines.join('\n'));
    const cls = fenceLang
      ? ` class="language-${escapeHtmlAttr(fenceLang)}"`
      : '';
    out.push(`<pre><code${cls}>${code}</code></pre>`);
    inFence = false;
    fenceLang = '';
    fenceLines = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*```(.*)$/);
    if (fenceMatch) {
      if (!inFence) {
        flushQuote();
        inFence = true;
        fenceLang = (fenceMatch[1] ?? '').trim();
        fenceLines = [];
      } else {
        flushFence();
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      (quoteLines ??= []).push(convertInline(quoteMatch[1] ?? ''));
      continue;
    }
    flushQuote();

    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(`<b>${convertInline(heading[1] ?? '')}</b>`);
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      out.push(`${bullet[1]}- ${convertInline(bullet[2] ?? '')}`);
      continue;
    }

    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      out.push(
        `${ordered[1]}${ordered[2]}. ${convertInline(ordered[3] ?? '')}`,
      );
      continue;
    }

    out.push(convertInline(line));
  }
  if (inFence) flushFence(); // unterminated fence — close it
  flushQuote();
  return out.join('\n');
}

/**
 * Strip HTML tags and unescape entities — the plain-text fallback payload
 * when Telegram rejects an HTML chunk.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Chunk splitting — never split mid-tag or mid-entity; reopen styling tags
// across chunk boundaries; prefer paragraph > line > word boundaries.
// ---------------------------------------------------------------------------

const HTML_TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g;

type OpenTag = { name: string; openTag: string };

function openPrefix(openTags: OpenTag[]): string {
  return openTags.map((t) => t.openTag).join('');
}

function closeSuffix(openTags: OpenTag[]): string {
  return openTags
    .slice()
    .reverse()
    .map((t) => `</${t.name}>`)
    .join('');
}

function closeSuffixLen(openTags: OpenTag[]): number {
  return openTags.reduce((n, t) => n + t.name.length + 3, 0);
}

/**
 * Best split index within `max` chars of a text run: paragraph break, then
 * newline, then space (each only when not degenerately early), then an
 * entity-safe hard cut.
 */
function safeSplitIndex(text: string, max: number): number {
  if (text.length <= max) return text.length;
  const window = text.slice(0, max);
  const minUseful = Math.floor(max * 0.3);
  const para = window.lastIndexOf('\n\n');
  if (para > minUseful) return para;
  const nl = window.lastIndexOf('\n');
  if (nl > minUseful) return nl;
  const sp = window.lastIndexOf(' ');
  if (sp > minUseful) return sp;
  // Hard cut — back off if it would sever an HTML entity like &amp;
  const amp = window.lastIndexOf('&');
  if (
    amp > 0 &&
    window.lastIndexOf(';') < amp &&
    /^&#?[a-zA-Z0-9]{0,9}$/.test(window.slice(amp))
  ) {
    return amp;
  }
  return max;
}

/**
 * Split Telegram HTML into chunks of at most `limit` characters. Chunks never
 * end mid-tag or mid-entity; open styling tags are closed at each chunk end
 * and reopened at the start of the next chunk, so every chunk parses on its
 * own.
 */
export function splitTelegramHtmlChunks(html: string, limit: number): string[] {
  if (!html) return [];
  const normalizedLimit = Math.max(16, Math.floor(limit));
  if (html.length <= normalizedLimit) return [html];

  const chunks: string[] = [];
  const openTags: OpenTag[] = [];
  let current = '';
  let hasPayload = false;

  const reset = () => {
    current = openPrefix(openTags);
    hasPayload = false;
  };
  const flush = () => {
    if (!hasPayload) return;
    chunks.push(current + closeSuffix(openTags));
    reset();
  };
  const appendText = (segment: string) => {
    let remaining = segment;
    while (remaining.length > 0) {
      const available =
        normalizedLimit - current.length - closeSuffixLen(openTags);
      if (available <= 0) {
        if (!hasPayload) {
          throw new Error(
            `telegram html chunking: tag overhead exceeds limit (${normalizedLimit})`,
          );
        }
        flush();
        continue;
      }
      if (remaining.length <= available) {
        current += remaining;
        hasPayload = true;
        break;
      }
      let splitAt = safeSplitIndex(remaining, available);
      if (splitAt <= 0) {
        if (hasPayload) {
          flush();
          continue;
        }
        splitAt = Math.max(1, available); // force progress on pathological input
      }
      current += remaining.slice(0, splitAt);
      hasPayload = true;
      remaining = remaining.slice(splitAt).replace(/^[ \n]+/, '');
      flush();
    }
  };

  HTML_TAG_PATTERN.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = HTML_TAG_PATTERN.exec(html)) !== null) {
    appendText(html.slice(last, m.index));
    const raw = m[0];
    const name = (m[1] ?? '').toLowerCase();
    const isClosing = raw.startsWith('</');
    if (!isClosing) {
      // If the tag plus its eventual close can't fit, start a fresh chunk.
      const needed = raw.length + closeSuffixLen(openTags) + name.length + 3;
      if (hasPayload && current.length + needed > normalizedLimit) {
        flush();
      }
      current += raw;
      openTags.push({ name, openTag: raw });
    } else {
      current += raw;
      for (let i = openTags.length - 1; i >= 0; i -= 1) {
        if (openTags[i]?.name === name) {
          openTags.splice(i, 1);
          break;
        }
      }
    }
    last = HTML_TAG_PATTERN.lastIndex;
  }
  appendText(html.slice(last));
  flush();
  return chunks.length > 0 ? chunks : [html];
}
