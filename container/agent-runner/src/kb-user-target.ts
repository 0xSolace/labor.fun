/**
 * Resolve add_kb_user's `target_telegram_jid` before it is written to IPC.
 *
 * The orchestrator creates the account and then posts its password to this
 * jid as given, so the jid must name the new user's own DM explicitly.
 * resolveTargetJid() suits ordinary sends, where a blank target or the current
 * chat's bare id means "this chat". Here that would post a password into a
 * chat that may be a group. So:
 *  - omitted or blank         → rejected; the parameter is required
 *  - the current chat's own id without its prefix, with or without colons in
 *    it                       → rejected with its own message. Mapping it to
 *                               the current chat could publish the password,
 *                               and advice to add a prefix would lead there
 *  - any other bare id (no platform prefix)
 *                             → rejected; no channel can deliver it
 *  - a WhatsApp jid, or anything prefixed
 *                             → resolveTargetJid(): "telegram:" and known
 *                               prefixes in the wrong case are canonicalized,
 *                               anything else passes through
 *  - then, whatever the current chat, a group chat → rejected: a Telegram
 *    group, supergroup or channel ("tg:" + a negative id, or "tg:@name",
 *    which the Bot API accepts only for channels and supergroups), a WhatsApp
 *    group ("@g.us") or a Signal group ("signal:group:"). Other platforms'
 *    jids don't show whether they are DMs, so they pass.
 *
 * A rejection means no IPC is written, so no account is created.
 */

import { resolveTargetJid, type TargetJidResolution } from './target-jid.js';

const PARAM = 'target_telegram_jid';
const DM_EXAMPLE = '"tg:1234567890"';
const NOTHING_SENT = 'No account was created and nothing was sent.';

function isWhatsAppJid(jid: string): boolean {
  return jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net');
}

/**
 * Group chats by jid shape, checked on the resolved (canonical-prefix) jid.
 * The Telegram channel hands whatever follows "tg:" to the Bot API as the
 * chat_id, so a negative id or an "@name" never reaches a person's DM.
 */
function isGroupJid(jid: string): boolean {
  return (
    /^tg:\s*[-@]/.test(jid) ||
    /@g\.us$/i.test(jid) ||
    /^signal:group:/i.test(jid)
  );
}

export function resolveKbUserTarget(
  raw: string | undefined,
  currentChatJid: string,
): TargetJidResolution {
  const target = raw?.trim();
  if (!target) {
    return {
      ok: false,
      error:
        `${PARAM} is required: the recipient's full DM JID, e.g. ${DM_EXAMPLE}. ` +
        NOTHING_SENT,
    };
  }

  if (!isWhatsAppJid(target)) {
    // Checked before the prefix test: the id itself may contain colons.
    const curSep = currentChatJid.indexOf(':');
    if (curSep > 0 && target === currentChatJid.slice(curSep + 1)) {
      return {
        ok: false,
        error:
          `${PARAM} "${target}" is this chat's own id. KB credentials must go to ` +
          `the new user's own DM JID (e.g. ${DM_EXAMPLE}), never to this chat. ` +
          NOTHING_SENT,
      };
    }
    if (target.indexOf(':') <= 0) {
      return {
        ok: false,
        error:
          `${PARAM} "${target}" has no platform prefix, so it can't be delivered. ` +
          `Use the recipient's full DM JID, e.g. ${DM_EXAMPLE}. ` +
          NOTHING_SENT,
      };
    }
  }

  const resolved = resolveTargetJid(target, currentChatJid, PARAM);
  if (resolved.ok && isGroupJid(resolved.jid)) {
    return {
      ok: false,
      error:
        `${PARAM} "${target}" is a group chat. KB credentials must go to the ` +
        `new user's own DM JID (e.g. ${DM_EXAMPLE}), never to a group. ` +
        NOTHING_SENT,
    };
  }
  return resolved;
}
