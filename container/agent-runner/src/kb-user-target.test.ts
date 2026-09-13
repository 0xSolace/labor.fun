import { describe, expect, it } from 'vitest';

import { resolveKbUserTarget } from './kb-user-target.js';

const GROUP = 'tg:-1001234567890';
const DM = 'tg:1234567890';

function rejection(raw: string | undefined, current = GROUP): string {
  const r = resolveKbUserTarget(raw, current);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
}

function expectOwnIdRejection(raw: string, current: string): void {
  const error = rejection(raw, current);
  expect(error).toContain("is this chat's own id");
  expect(error).toContain("the new user's own DM JID");
  expect(error).toContain('never to this chat');
  expect(error).toContain('No account was created and nothing was sent');
  expect(error.toLowerCase()).not.toContain('prefix');
}

function expectGroupRejection(raw: string, current: string): void {
  const error = rejection(raw, current);
  expect(error).toContain('is a group chat');
  expect(error).toContain("the new user's own DM JID");
  expect(error).toContain('No account was created and nothing was sent');
  expect(error.toLowerCase()).not.toContain('prefix');
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
    expect(error).not.toContain("this chat's own id");
  });

  it("rejects the current chat's own bare id with its own message and no prefix advice", () => {
    expectOwnIdRejection('-1001234567890', GROUP);
    expectOwnIdRejection(' -1001234567890 ', GROUP);
    expectOwnIdRejection('1234567890', DM);
  });

  it("gives the current chat's bare id the same message when that id contains colons", () => {
    expectOwnIdRejection('19:abc123@thread.v2', 'teams:19:abc123@thread.v2');
    expectOwnIdRejection('site1:sess1', 'web:site1:sess1');
    expectOwnIdRejection('group:QUJDREVG+/=', 'signal:group:QUJDREVG+/=');
  });

  it('rejects a leading-colon value rather than treating it as prefixed', () => {
    expect(rejection(':987654321')).toContain("recipient's full DM JID");
  });

  it('rejects group chats as credential targets, whatever the current chat', () => {
    for (const current of [
      GROUP,
      DM,
      'slack:D0123456789',
      '15551234567@s.whatsapp.net',
    ]) {
      for (const raw of [
        'tg:-1001234567890',
        'telegram:-1001234567890',
        'TG:-1001234567890',
        ' tg:-1001234567890 ',
        'tg:-987654321',
        '120363@g.us',
        'signal:group:abc',
      ]) {
        expectGroupRejection(raw, current);
      }
    }
  });

  it('rejects Telegram chats addressed by @name or with a spaced negative id', () => {
    expectGroupRejection('tg:@somechannel', DM);
    expectGroupRejection('tg: -1001234567890', DM);
  });

  it('canonicalizes the telegram: prefix and a known prefix in the wrong case', () => {
    expect(resolveKbUserTarget('telegram:1234567890', GROUP)).toEqual({
      ok: true,
      jid: DM,
    });
    expect(resolveKbUserTarget('TG:1234567890', GROUP)).toEqual({
      ok: true,
      jid: DM,
    });
  });

  it('passes a well-formed DM jid through untouched', () => {
    for (const current of [GROUP, DM, 'slack:C0123456789']) {
      expect(resolveKbUserTarget('tg:1234567890', current)).toEqual({
        ok: true,
        jid: DM,
      });
      expect(resolveKbUserTarget(' tg:1234567890 ', current)).toEqual({
        ok: true,
        jid: DM,
      });
    }
  });

  it('passes WhatsApp DM jids through, including device jids containing a colon', () => {
    expect(resolveKbUserTarget('15551234567@s.whatsapp.net', GROUP)).toEqual({
      ok: true,
      jid: '15551234567@s.whatsapp.net',
    });
    expect(resolveKbUserTarget('15551234567:12@s.whatsapp.net', GROUP)).toEqual(
      { ok: true, jid: '15551234567:12@s.whatsapp.net' },
    );
  });

  it("passes other platforms' jids through, since their shape doesn't show a group", () => {
    for (const jid of [
      'slack:D0123456789',
      'signal:+15551234567',
      'dc:123456789012345678',
    ]) {
      expect(resolveKbUserTarget(jid, GROUP)).toEqual({ ok: true, jid });
    }
  });

  it("accepts the current chat's full jid when it is a DM", () => {
    expect(resolveKbUserTarget(DM, DM)).toEqual({ ok: true, jid: DM });
  });

  it("rejects the current chat's full jid when it is a group", () => {
    expectGroupRejection(GROUP, GROUP);
    expectGroupRejection('120363@g.us', '120363@g.us');
    expectGroupRejection('signal:group:abc', 'signal:group:abc');
  });

  it('never tells the agent to omit the required parameter', () => {
    for (const raw of [
      undefined,
      '',
      '   ',
      '987654321',
      '-1001234567890',
      ':987654321',
      'tg:-1001234567890',
      '120363@g.us',
      'signal:group:abc',
    ]) {
      expect(rejection(raw).toLowerCase()).not.toContain('omit');
    }
  });
});
