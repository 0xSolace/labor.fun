import { describe, expect, it } from 'vitest';

import { resolveTargetJid } from './target-jid.js';

const HOUSE = 'tg:-1003686659419';

describe('resolveTargetJid', () => {
  it('defaults to the current chat when target is omitted or blank', () => {
    expect(resolveTargetJid(undefined, HOUSE)).toEqual({
      ok: true,
      jid: HOUSE,
    });
    expect(resolveTargetJid('', HOUSE)).toEqual({ ok: true, jid: HOUSE });
    expect(resolveTargetJid('   ', HOUSE)).toEqual({ ok: true, jid: HOUSE });
  });

  it('routes the bare id of the current chat to it (the lost 2026-09-12 rotation post)', () => {
    expect(resolveTargetJid('-1003686659419', HOUSE)).toEqual({
      ok: true,
      jid: HOUSE,
    });
    expect(resolveTargetJid(' -1003686659419 ', HOUSE)).toEqual({
      ok: true,
      jid: HOUSE,
    });
  });

  it('rewrites the spelled-out telegram: prefix', () => {
    expect(resolveTargetJid('telegram:-1003686659419', HOUSE)).toEqual({
      ok: true,
      jid: HOUSE,
    });
    expect(resolveTargetJid('Telegram:7760895633', HOUSE)).toEqual({
      ok: true,
      jid: 'tg:7760895633',
    });
  });

  it('canonicalizes a known prefix in the wrong case without touching the id', () => {
    expect(resolveTargetJid('TG:-1001', HOUSE)).toEqual({
      ok: true,
      jid: 'tg:-1001',
    });
    expect(resolveTargetJid('SLACK:C0ABCDEF', HOUSE)).toEqual({
      ok: true,
      jid: 'slack:C0ABCDEF',
    });
  });

  it('passes well-formed jids through untouched', () => {
    expect(resolveTargetJid('tg:7760895633', HOUSE)).toEqual({
      ok: true,
      jid: 'tg:7760895633',
    });
    expect(resolveTargetJid('slack:C0123456789', HOUSE)).toEqual({
      ok: true,
      jid: 'slack:C0123456789',
    });
    expect(resolveTargetJid(HOUSE, 'tg:7760895633')).toEqual({
      ok: true,
      jid: HOUSE,
    });
  });

  it('passes WhatsApp jids through, including device jids containing a colon', () => {
    expect(resolveTargetJid('120363@g.us', HOUSE)).toEqual({
      ok: true,
      jid: '120363@g.us',
    });
    expect(resolveTargetJid('15551234567:12@s.whatsapp.net', HOUSE)).toEqual({
      ok: true,
      jid: '15551234567:12@s.whatsapp.net',
    });
  });

  it('passes unknown prefixes through for plugin-registered channels', () => {
    expect(resolveTargetJid('gh:org/repo#12', HOUSE)).toEqual({
      ok: true,
      jid: 'gh:org/repo#12',
    });
  });

  it('rejects any other bare id and suggests the prefixed form', () => {
    const r = resolveTargetJid('7760895633', HOUSE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('"tg:7760895633"');
      expect(r.error).toContain('nothing was sent');
      expect(r.error).toContain('omit target_jid');
    }
  });

  it('rejects a leading-colon value rather than treating it as prefixed', () => {
    expect(resolveTargetJid(':-1003686659419', HOUSE).ok).toBe(false);
  });

  it('names the parameter it rejected', () => {
    const r = resolveTargetJid('123', HOUSE, 'target_group_jid');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('target_group_jid "123"');
      expect(r.error).toContain('omit target_group_jid');
    }
  });

  it('rejects without a platform hint when the current chat has no prefix', () => {
    const r = resolveTargetJid('555', '120363@g.us');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain('If you meant');
  });
});
