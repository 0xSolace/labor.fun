import { describe, expect, it } from 'vitest';

import { resolveKbUserTarget } from './kb-user-target.js';

const GROUP = 'tg:-1001234567890';

function rejection(raw: string | undefined, current = GROUP): string {
  const r = resolveKbUserTarget(raw, current);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
}

describe('resolveKbUserTarget', () => {
  it('rejects an omitted or blank target instead of using the current chat', () => {
    for (const raw of [undefined, '', '   ']) {
      const error = rejection(raw);
      expect(error).toContain('target_telegram_jid is required');
      expect(error).toContain('"tg:1234567890"');
      expect(error).toContain('No account was created');
    }
  });

  it('rejects a bare DM id and asks for the full DM JID', () => {
    const error = rejection('987654321');
    expect(error).toContain('target_telegram_jid "987654321"');
    expect(error).toContain("recipient's full DM JID");
    expect(error).toContain('No account was created');
  });

  it("rejects the current chat's own bare id instead of mapping it to the chat", () => {
    expect(rejection('-1001234567890')).toContain("recipient's full DM JID");
    expect(rejection(' -1001234567890 ')).toContain("recipient's full DM JID");
  });

  it("rejects the current chat's bare id even when that id contains colons", () => {
    const teams = 'teams:19:abc123@thread.v2';
    const web = 'web:site1:sess1';
    const signalGroup = 'signal:group:QUJDREVG+/=';
    expect(rejection('19:abc123@thread.v2', teams)).toContain(
      "recipient's full DM JID",
    );
    expect(rejection('site1:sess1', web)).toContain("recipient's full DM JID");
    expect(rejection('group:QUJDREVG+/=', signalGroup)).toContain(
      "recipient's full DM JID",
    );
  });

  it('rejects a leading-colon value rather than treating it as prefixed', () => {
    expect(rejection(':987654321')).toContain("recipient's full DM JID");
  });

  it('canonicalizes the telegram: prefix and a known prefix in the wrong case', () => {
    expect(resolveKbUserTarget('telegram:123', GROUP)).toEqual({
      ok: true,
      jid: 'tg:123',
    });
    expect(resolveKbUserTarget('TG:123', GROUP)).toEqual({
      ok: true,
      jid: 'tg:123',
    });
  });

  it('passes a well-formed DM jid through untouched', () => {
    expect(resolveKbUserTarget('tg:123', GROUP)).toEqual({
      ok: true,
      jid: 'tg:123',
    });
    expect(resolveKbUserTarget(' tg:123 ', GROUP)).toEqual({
      ok: true,
      jid: 'tg:123',
    });
  });

  it('passes WhatsApp jids through, including device jids containing a colon', () => {
    expect(resolveKbUserTarget('15551234567@s.whatsapp.net', GROUP)).toEqual({
      ok: true,
      jid: '15551234567@s.whatsapp.net',
    });
    expect(resolveKbUserTarget('15551234567:12@s.whatsapp.net', GROUP)).toEqual(
      { ok: true, jid: '15551234567:12@s.whatsapp.net' },
    );
  });

  it('accepts the current chat only when its full jid is given', () => {
    expect(resolveKbUserTarget(GROUP, GROUP)).toEqual({
      ok: true,
      jid: GROUP,
    });
  });

  it('never tells the agent to omit the required parameter', () => {
    for (const raw of [
      undefined,
      '',
      '   ',
      '987654321',
      '-1001234567890',
      ':987654321',
    ]) {
      expect(rejection(raw).toLowerCase()).not.toContain('omit');
    }
  });
});
