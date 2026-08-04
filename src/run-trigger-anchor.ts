/**
 * Per-chat "latest triggering message" anchor for active agent runs.
 *
 * Why: a reply must land in the thread/topic of the message that ACTUALLY
 * triggered it. For a fresh container that's the last message of the initial
 * batch — but when later messages are piped into an already-active container
 * (startMessageLoop's queue.sendMessage path), the runAgent streaming
 * callback's captured triggerMessageId goes stale: it still points at the
 * message that started the run. In a Telegram forum group that posted agent
 * replies to the General topic (threadId undefined) even though the
 * triggering message carried a thread_id (e.g. topic 15) — the "rogue text
 * in general" bug.
 *
 * The anchor only advances when messages are actually handed to the active
 * run, preserving the #46 guarantee that a concurrent message which is NOT
 * part of the run can't hijack the reply target.
 */

const anchors = new Map<string, string>();

/** Start tracking an active run's trigger message for `chatJid`. */
export function beginRunAnchor(
  chatJid: string,
  messageId: string | undefined,
): void {
  if (messageId === undefined) {
    anchors.delete(chatJid);
    return;
  }
  anchors.set(chatJid, messageId);
}

/**
 * Advance the anchor to a newer triggering message — only if a run is
 * currently being tracked for this chat (piping into a container that
 * isn't tracked must not create a phantom anchor).
 */
export function advanceRunAnchor(
  chatJid: string,
  messageId: string | undefined,
): void {
  if (messageId === undefined) return;
  if (!anchors.has(chatJid)) return;
  anchors.set(chatJid, messageId);
}

/** The message id replies should currently anchor to, if a run is active. */
export function currentRunAnchor(chatJid: string): string | undefined {
  return anchors.get(chatJid);
}

/** Stop tracking (call from the run's finally). */
export function clearRunAnchor(chatJid: string): void {
  anchors.delete(chatJid);
}
