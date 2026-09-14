import { describe, expect, it } from 'vitest';

import { resolveKbUserTarget } from './kb-user-target.js';

const GROUP = 'tg:-1001234567890';
const DM = 'tg:1234567890';
const NOTHING_SENT = 'No account was created and nothing was sent';

/** Current chats the checks must hold in, DMs and groups on several platforms. */
const CURRENT_CHATS = [
  GROUP,
  DM,
  'slack:C0123456789',
  'slack:D0123456789',
  '15551234567@s.whatsapp.net',
  '120363@g.us',
  'signal:group:abc',
  'dc:123456789012345678',
  'teams:19:abc123@thread.v2',
];

/** Direct-message jids as each channel builds or delivers them. */
const DM_JIDS = [
  DM,
  'tg:4503599627370495', // the largest 52-bit id
  '15551234567@s.whatsapp.net',
  '15551234567:12@s.whatsapp.net', // a device jid
  'signal:+15551234567',
  'signal:0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  'slack:D0123456789',
  'slack:U0123456789',
  'slack:W0123456789',
  'dc-dm:123456789012345678',
];

/** Group chats, channels and shared threads. */
const GROUP_JIDS = [
  'tg:-1001234567890',
  'telegram:-1001234567890',
  'TG:-1001234567890',
  ' tg:-1001234567890 ',
  'tg:-987654321',
  'tg:@somechannel',
  'tg: -1001234567890',
  '120363@g.us',
  'signal:group:abc',
  'slack:C0123456789',
  'slack:G0123456789',
  'teams:19:abc123@thread.v2',
  'gh:owner/repo/1',
];

/** Discord channel ids: a server channel or a DM, and the id doesn't say which. */
const DISCORD_CHANNEL_JIDS = [
  'dc:123456789012345678',
  'DC:123456789012345678',
  ' dc:123456789012345678 ',
];

/** Prefixed values that are neither a deliverable DM nor group-shaped. */
const NON_DM_JIDS = [
  'tg:0-1001234567890',
  'tg:12345678901234567890', // 20 digits
  'tg:12345678901234567', // 17 digits, past the 16-digit limit
  'tg:0',
  'tg:\u22121001234567890', // Unicode minus
  'tg:\u200b1234567890', // zero-width space
  'tg:1234567890\u200b', // trailing zero-width space
  '0@s.whatsapp.net',
  '+15551234567@s.whatsapp.net', // a leading +
  'signal:u:someone.01',
  'slack:u0123456789',
  'dc:abc', // not a Discord id
  'dc-dm:abc',
  'teams:a:1AbCdEfGh', // Teams personal chat
  'web:site1:sess1',
  'x:123',
];

function rejection(raw: string | undefined, current = GROUP): string {
  const r = resolveKbUserTarget(raw, current);
  expect(r.ok, `${JSON.stringify(raw)} in ${current}`).toBe(false);
  return r.ok ? '' : r.error;
}

function expectAccepted(raw: string, jid: string, current = GROUP): void {
  expect(
    resolveKbUserTarget(raw, current),
    `${JSON.stringify(raw)} in ${current}`,
  ).toEqual({ ok: true, jid });
}

function expectOwnIdRejection(raw: string, current: string): void {
  const error = rejection(raw, current);
  expect(error).toContain("is this chat's id without its platform prefix");
  expect(error).toContain('the new user\'s full DM JID, e.g. "tg:1234567890"');
  expect(error).toContain(NOTHING_SENT);
  expect(error.toLowerCase()).not.toContain('never');
}

function expectGroupRejection(raw: string, current: string): void {
  const error = rejection(raw, current);
  expect(error, `${JSON.stringify(raw)} in ${current}`).toContain(
    'looks like a group chat, channel or thread',
  );
  expect(error).toContain("the new user's own DM");
  expect(error).toContain('"tg:1234567890"');
  expect(error).toContain(NOTHING_SENT);
}

function expectDiscordRejection(raw: string, current: string): void {
  const error = rejection(raw, current);
  expect(error, `${JSON.stringify(raw)} in ${current}`).toBe(
    `target_telegram_jid "${raw.trim()}" is a Discord channel id, which can ` +
      "be a server channel or a DM, and this tool can't tell which. Pass the " +
      'new user\'s Discord DM as "dc-dm:<user id>". No account was created ' +
      'and nothing was sent.',
  );
  expect(error).toContain('"dc-dm:<user id>"');
  expect(error.toLowerCase()).not.toContain('group');
}

function expectNonDmRejection(raw: string, current: string): void {
  const error = rejection(raw, current);
  expect(error, `${JSON.stringify(raw)} in ${current}`).toContain(
    "isn't a direct-message JID this tool can deliver credentials to",
  );
  expect(error).not.toContain('group chat');
  expect(error).toContain('"tg:1234567890"');
  expect(error).toContain(NOTHING_SENT);
}

describe('resolveKbUserTarget', () => {
  it('rejects an omitted or blank target instead of using the current chat', () => {
    for (const raw of [undefined, '', '   ']) {
      const error = rejection(raw);
      expect(error).toContain('target_telegram_jid is required');
      expect(error).toContain('"tg:1234567890"');
      expect(error).toContain(NOTHING_SENT);
    }
  });

  it('accepts direct-message jids, whatever the current chat', () => {
    for (const current of CURRENT_CHATS) {
      for (const jid of DM_JIDS) expectAccepted(jid, jid, current);
    }
  });

  it('trims padding before accepting', () => {
    expectAccepted(' tg:1234567890 ', DM);
    expectAccepted('\ttg:1234567890\n', DM);
    expectAccepted(' slack:U0123456789 ', 'slack:U0123456789');
    expectAccepted(
      ' 15551234567@s.whatsapp.net ',
      '15551234567@s.whatsapp.net',
    );
  });

  it('canonicalizes the telegram: prefix and known prefixes in the wrong case', () => {
    expectAccepted('telegram:1234567890', DM);
    expectAccepted('Telegram:1234567890', DM);
    expectAccepted('TG:1234567890', DM);
    expectAccepted('SLACK:U0123456789', 'slack:U0123456789');
    expectAccepted('Signal:+15551234567', 'signal:+15551234567');
  });

  it("accepts the current chat's full jid when it is a DM", () => {
    for (const jid of [
      DM,
      'slack:D0123456789',
      'signal:+15551234567',
      '15551234567@s.whatsapp.net',
    ]) {
      expectAccepted(jid, jid, jid);
    }
  });

  it('rejects group chats, channels and threads with a group message, whatever the current chat', () => {
    for (const current of CURRENT_CHATS) {
      for (const raw of GROUP_JIDS) expectGroupRejection(raw, current);
    }
  });

  it("rejects the current chat's full jid when it is a group, on each platform", () => {
    for (const jid of [
      GROUP,
      'tg:@somechannel',
      '120363@g.us',
      'signal:group:abc',
      'slack:C0123456789',
      'slack:G0123456789',
      'teams:19:abc123@thread.v2',
      'gh:owner/repo/1',
    ]) {
      expectGroupRejection(jid, jid);
    }
  });

  it('rejects a Discord channel id with its own message, not a group one, whatever the current chat', () => {
    for (const current of CURRENT_CHATS) {
      for (const raw of DISCORD_CHANNEL_JIDS) {
        expectDiscordRejection(raw, current);
      }
    }
  });

  it("gives the current chat's full jid the Discord message when it is a Discord channel", () => {
    const channel = 'dc:123456789012345678';
    expectDiscordRejection(channel, channel);
    expectDiscordRejection(channel, 'dc:876543210987654321');
  });

  it('still accepts a Discord DM given as dc-dm:<user id>', () => {
    for (const current of ['dc:123456789012345678', GROUP, DM]) {
      expectAccepted(
        'dc-dm:123456789012345678',
        'dc-dm:123456789012345678',
        current,
      );
    }
  });

  it('rejects anything else that is prefixed, naming it as no deliverable DM', () => {
    for (const current of CURRENT_CHATS) {
      for (const raw of NON_DM_JIDS) expectNonDmRejection(raw, current);
    }
  });

  it('lists the accepted DM forms when it rejects a prefixed target', () => {
    for (const raw of [
      'slack:C0123456789',
      '+15551234567@s.whatsapp.net',
      'x:123',
    ]) {
      const error = rejection(raw);
      expect(error).toContain('<digits, no +>@s.whatsapp.net');
      expect(error).toContain('slack:<id starting with D, U or W>');
      expect(error).toContain('dc-dm:<user id>');
    }
  });

  it('rejects a bare id and asks for the full DM JID', () => {
    const error = rejection('987654321');
    expect(error).toContain(
      'target_telegram_jid "987654321" has no platform prefix',
    );
    expect(error).toContain("the new user's full DM JID");
    expect(error).toContain(NOTHING_SENT);
    expect(error).not.toContain("this chat's id");
  });

  it('rejects a leading-colon value rather than treating it as prefixed', () => {
    expect(rejection(':987654321')).toContain('has no platform prefix');
  });

  it("rejects the current chat's own bare id and says what it is", () => {
    expectOwnIdRejection('-1001234567890', GROUP);
    expectOwnIdRejection(' -1001234567890 ', GROUP);
    expectOwnIdRejection('1234567890', DM);
    expectOwnIdRejection('D0123456789', 'slack:D0123456789');
    expectOwnIdRejection('C0123456789', 'slack:C0123456789');
  });

  it("gives the current chat's bare id the same message when that id contains colons", () => {
    expectOwnIdRejection('19:abc123@thread.v2', 'teams:19:abc123@thread.v2');
    expectOwnIdRejection('site1:sess1', 'web:site1:sess1');
    expectOwnIdRejection('group:QUJDREVG+/=', 'signal:group:QUJDREVG+/=');
  });

  it('never tells the agent to omit the required parameter', () => {
    for (const current of CURRENT_CHATS) {
      for (const raw of [
        undefined,
        '',
        '   ',
        '987654321',
        ':987654321',
        '-1001234567890',
        '1234567890',
        ...GROUP_JIDS,
        ...DISCORD_CHANNEL_JIDS,
        ...NON_DM_JIDS,
      ]) {
        const r = resolveKbUserTarget(raw, current);
        if (!r.ok) expect(r.error.toLowerCase()).not.toContain('omit');
      }
    }
  });
});
