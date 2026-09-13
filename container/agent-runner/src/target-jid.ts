/**
 * Resolve a chat JID the model supplied (send_message / edit_message /
 * delete_message `target_jid`, schedule_task `target_group_jid`) before it is
 * written to IPC.
 *
 * Every channel's ownsJid() requires a platform prefix ("tg:", "slack:",
 * "dc:", ...) or, for WhatsApp, an "@g.us" / "@s.whatsapp.net" suffix, so a
 * bare id like "-1003686659419" can never be delivered. It used to be accepted
 * here with an optimistic "queued for delivery" reply and dropped by the
 * orchestrator afterwards — by which point a scheduled task had already told
 * itself it posted. Receipt: The Convent's garbage/fridge rotation on
 * 2026-09-12, whose announcement was lost while the rotation still advanced.
 *
 * Resolution is deliberately conservative:
 *  - omitted                  → the current chat (unchanged behaviour)
 *  - "telegram:…", or a known prefix in the wrong case
 *                             → canonical prefix; the id itself is untouched
 *  - bare id of the current chat
 *                             → the current chat (unambiguous)
 *  - any other bare id        → rejected with the corrected form, so the model
 *                               can fix it within the same run
 *  - any other prefix         → passed through; the orchestrator still judges
 *                               deliverability, and plugin channels may own
 *                               prefixes this file doesn't know about
 */

const CANONICAL_PREFIX: Record<string, string> = {
  tg: 'tg',
  telegram: 'tg',
  slack: 'slack',
  dc: 'dc',
  signal: 'signal',
  teams: 'teams',
  web: 'web',
};

const PLATFORM_NAME: Record<string, string> = {
  tg: 'Telegram',
  slack: 'Slack',
  dc: 'Discord',
  signal: 'Signal',
  teams: 'Teams',
  web: 'web',
};

export type TargetJidResolution =
  | { ok: true; jid: string }
  | { ok: false; error: string };

function isWhatsAppJid(jid: string): boolean {
  return jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net');
}

export function resolveTargetJid(
  target: string | undefined,
  currentChatJid: string,
  param = 'target_jid',
): TargetJidResolution {
  const raw = target?.trim();
  if (!raw) return { ok: true, jid: currentChatJid };
  if (raw === currentChatJid || isWhatsAppJid(raw))
    return { ok: true, jid: raw };

  const sep = raw.indexOf(':');
  if (sep > 0) {
    const canonical = CANONICAL_PREFIX[raw.slice(0, sep).toLowerCase()];
    return {
      ok: true,
      jid: canonical ? `${canonical}:${raw.slice(sep + 1)}` : raw,
    };
  }

  const curSep = currentChatJid.indexOf(':');
  const curPrefix = curSep > 0 ? currentChatJid.slice(0, curSep) : '';
  if (curPrefix && raw === currentChatJid.slice(curSep + 1)) {
    return { ok: true, jid: currentChatJid };
  }

  const platform = PLATFORM_NAME[curPrefix];
  const hint = platform
    ? ` If you meant a ${platform} chat, use "${curPrefix}:${raw}".`
    : '';
  return {
    ok: false,
    error:
      `${param} "${raw}" has no platform prefix, so no channel can deliver to it — nothing was sent.` +
      hint +
      ` To reach the current chat, omit ${param}.`,
  };
}
