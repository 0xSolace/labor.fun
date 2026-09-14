/**
 * Resolve add_kb_user's `target_telegram_jid` before it is written to IPC.
 *
 * The orchestrator creates the account, then posts its password to this jid
 * through whichever connected channel claims it. So the jid must name the new
 * user's own direct-message chat, in a shape that channel delivers:
 *  - omitted or blank         → rejected; the parameter is required
 *  - the current chat's own id without its platform prefix, with or without
 *    colons in it             → rejected; the recipient is named in full,
 *                               never inferred from this chat
 *  - any other bare id        → rejected; no channel can deliver it
 *  - anything else            → resolveTargetJid() canonicalizes "telegram:"
 *                               and known prefixes in the wrong case, then
 *                               the resolved jid must match DM_JID_SHAPES
 *
 * DM_JID_SHAPES is an allowlist, so it fails safe: group chats, channels,
 * threads, web sessions, plugin prefixes, malformed ids and any shape added
 * later are rejected until they are listed there. DISCORD_CHANNEL_JID and
 * GROUP_JID_SHAPES only pick the wording of a rejection.
 *
 * A rejection writes no IPC, so no account is created.
 */

import { resolveTargetJid, type TargetJidResolution } from './target-jid.js';

const PARAM = 'target_telegram_jid';
const DM_EXAMPLE = '"tg:1234567890"';
const NOTHING_SENT = 'No account was created and nothing was sent.';
const ACCEPTED_FORMS =
  `Accepted forms: tg:<user id> (e.g. ${DM_EXAMPLE}), ` +
  '<digits, no +>@s.whatsapp.net, signal:<+phone or uuid>, ' +
  'slack:<id starting with D, U or W>, dc-dm:<user id>.';

/**
 * Direct-message jids, per channel, as each channel builds or delivers them:
 *  - Telegram: a private chat's id is the user's id. The pattern takes a
 *    positive id of at most 16 digits; Bot API user ids fit in 52 bits.
 *    Groups, supergroups and channels have negative ids or @names, so a
 *    positive id is never one of them.
 *  - WhatsApp: a phone number's digits with no leading +, optionally with a
 *    device suffix, which Baileys drops when it fans the message out to the
 *    user's devices.
 *  - Signal: an E.164 number or the account's uuid.
 *  - Slack: a DM channel (D…) or a user (U…, or W… on Enterprise Grid);
 *    chat.postMessage delivers a user id to the bot's DM with that user.
 *  - Discord: "dc-dm:" and a user id (a snowflake). A "dc:" channel id may be
 *    a server channel or a DM, and the id alone doesn't say which, so it is
 *    rejected with its own message (see DISCORD_CHANNEL_JID).
 * Teams is left out: the channel tells a personal chat from a group by the
 * inbound activity's conversationType, not by its id, and it can only send to
 * a conversation it has heard from since it started.
 */
const DM_JID_SHAPES: readonly RegExp[] = [
  /^tg:[1-9]\d{0,15}$/,
  /^[1-9]\d{0,14}(?::\d+)?@s\.whatsapp\.net$/,
  /^signal:(?:\+[1-9]\d{1,14}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
  /^slack:[DUW][A-Z0-9]+$/,
  /^dc-dm:[1-9]\d{0,19}$/,
];

/**
 * A Discord channel id. The Discord channel keys a DM as "dc:<channel id>"
 * too, so this can't be called a group: it gets its own rejection.
 */
const DISCORD_CHANNEL_JID = /^dc:[1-9]\d{0,19}$/;

/** Group chats, channels and shared threads, by shape. */
const GROUP_JID_SHAPES: readonly RegExp[] = [
  /^tg:\s*[-@]/, // Telegram group, supergroup or channel
  /@g\.us$/i, // WhatsApp group
  /^signal:group:/,
  /^slack:[CG]/, // Slack channel or private group
  /^teams:19:/, // Teams group chat or channel
  /^gh:/, // GitHub issue or pull request thread
];

function isWhatsAppJid(jid: string): boolean {
  return jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net');
}

function rejected(reason: string): TargetJidResolution {
  return { ok: false, error: `${reason} ${NOTHING_SENT}` };
}

export function resolveKbUserTarget(
  raw: string | undefined,
  currentChatJid: string,
): TargetJidResolution {
  const target = raw?.trim();
  if (!target) {
    return rejected(
      `${PARAM} is required: the new user's own DM JID, e.g. ${DM_EXAMPLE}.`,
    );
  }

  if (!isWhatsAppJid(target)) {
    // Checked before the prefix test: the id itself may contain colons.
    const curSep = currentChatJid.indexOf(':');
    if (curSep > 0 && target === currentChatJid.slice(curSep + 1)) {
      return rejected(
        `${PARAM} "${target}" is this chat's id without its platform prefix. ` +
          `Pass the new user's full DM JID, e.g. ${DM_EXAMPLE}.`,
      );
    }
    if (target.indexOf(':') <= 0) {
      return rejected(
        `${PARAM} "${target}" has no platform prefix, so it can't be delivered. ` +
          `Pass the new user's full DM JID, e.g. ${DM_EXAMPLE}.`,
      );
    }
  }

  const resolved = resolveTargetJid(target, currentChatJid, PARAM);
  if (resolved.ok && DM_JID_SHAPES.some((re) => re.test(resolved.jid))) {
    return resolved;
  }
  // resolveTargetJid can't fail here (bare ids were handled above), but its
  // error is never passed on: it tells the agent to omit the parameter.
  const jid = resolved.ok ? resolved.jid : target;
  if (DISCORD_CHANNEL_JID.test(jid)) {
    return rejected(
      `${PARAM} "${target}" is a Discord channel id, which can be a server ` +
        `channel or a DM, and this tool can't tell which. ` +
        `Pass the new user's Discord DM as "dc-dm:<user id>".`,
    );
  }
  if (GROUP_JID_SHAPES.some((re) => re.test(jid))) {
    return rejected(
      `${PARAM} "${target}" looks like a group chat, channel or thread. ` +
        `KB credentials go only to the new user's own DM. ${ACCEPTED_FORMS}`,
    );
  }
  return rejected(
    `${PARAM} "${target}" isn't a direct-message JID this tool can deliver ` +
      `credentials to. ${ACCEPTED_FORMS}`,
  );
}
