/**
 * Detect "error-shaped" agent results: text a runner emitted as a SUCCESS
 * result whose content is actually a raw API/proxy failure, e.g.
 * "API Error: 502 error code: 502" after Claude Code exhausted its internal
 * retries against a dead model proxy, or an upstream policy-refusal blob.
 *
 * These must be classified as run ERRORS and never posted to a chat as if
 * the agent said them. Receipts: salem.error.log 2026-08-06 18:06/18:10 UTC,
 * where the raw 502 text was delivered verbatim to "DM: clove".
 *
 * Kept deliberately conservative to avoid swallowing legitimate replies that
 * merely QUOTE an error string:
 *  - "API Error" must lead the text (the SDK emits it as a prefix), or
 *  - "error code: NNN" matches only when the whole text is short enough to
 *    plainly be an error blob rather than prose.
 */
export function isErrorShapedResult(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (/^API Error\b/i.test(t)) return true;
  if (t.length <= 300 && /\berror code:? \d{3}\b/i.test(t)) return true;
  return false;
}
