/**
 * Resolve add_kb_user's `target_telegram_jid` before it is written to IPC.
 *
 * The orchestrator creates the account and then posts its password to this
 * jid as given, so the jid must name the recipient explicitly.
 * resolveTargetJid() suits ordinary sends, where a blank target or the current
 * chat's bare id means "this chat". Here that would post a password into a
 * chat that may be a group. So:
 *  - omitted or blank         → rejected; the parameter is required
 *  - a bare id (no platform prefix) → rejected, including the current chat's
 *                               own id, with or without colons in it. No
 *                               channel can deliver a bare id, and mapping it
 *                               to the current chat would publish the password
 *  - a WhatsApp jid, or anything prefixed
 *                             → resolveTargetJid(): "telegram:" and known
 *                               prefixes in the wrong case are canonicalized,
 *                               anything else passes through
 *
 * A rejection means no IPC is written, so no account is created.
 */

import { resolveTargetJid, type TargetJidResolution } from './target-jid.js';

const PARAM = 'target_telegram_jid';
const DM_EXAMPLE = '"tg:1234567890"';

function isWhatsAppJid(jid: string): boolean {
  return jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net');
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
        `No account was created and nothing was sent.`,
    };
  }

  if (!isWhatsAppJid(target)) {
    const curSep = currentChatJid.indexOf(':');
    const currentBareId =
      curSep > 0 ? currentChatJid.slice(curSep + 1) : undefined;
    if (target.indexOf(':') <= 0 || target === currentBareId) {
      return {
        ok: false,
        error:
          `${PARAM} "${target}" has no platform prefix, so it can't be delivered. ` +
          `Use the recipient's full DM JID, e.g. ${DM_EXAMPLE}. ` +
          `No account was created and nothing was sent.`,
      };
    }
  }

  return resolveTargetJid(target, currentChatJid, PARAM);
}
