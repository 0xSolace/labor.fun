import { describe, it, expect, beforeEach } from 'vitest';

import {
  advanceRunAnchor,
  beginRunAnchor,
  clearRunAnchor,
  currentRunAnchor,
} from './run-trigger-anchor.js';

const JID = 'tg:-1003686659419';
const OTHER = 'tg:555';

beforeEach(() => {
  clearRunAnchor(JID);
  clearRunAnchor(OTHER);
});

describe('run-trigger-anchor', () => {
  it('tracks the run trigger and returns it', () => {
    beginRunAnchor(JID, '189');
    expect(currentRunAnchor(JID)).toBe('189');
  });

  it('advances to the latest piped message', () => {
    beginRunAnchor(JID, '189');
    advanceRunAnchor(JID, '195');
    expect(currentRunAnchor(JID)).toBe('195');
  });

  it('multiple advances keep the latest (reply in the thread of the latest trigger)', () => {
    beginRunAnchor(JID, '100');
    advanceRunAnchor(JID, '105');
    advanceRunAnchor(JID, '112');
    expect(currentRunAnchor(JID)).toBe('112');
  });

  it('does not advance when no run is tracked (no phantom anchor)', () => {
    advanceRunAnchor(JID, '999');
    expect(currentRunAnchor(JID)).toBeUndefined();
  });

  it('undefined trigger clears tracking', () => {
    beginRunAnchor(JID, '189');
    beginRunAnchor(JID, undefined);
    expect(currentRunAnchor(JID)).toBeUndefined();
    // and a subsequent advance is ignored
    advanceRunAnchor(JID, '200');
    expect(currentRunAnchor(JID)).toBeUndefined();
  });

  it('advance with undefined id is a no-op', () => {
    beginRunAnchor(JID, '189');
    advanceRunAnchor(JID, undefined);
    expect(currentRunAnchor(JID)).toBe('189');
  });

  it('clearRunAnchor stops tracking', () => {
    beginRunAnchor(JID, '189');
    clearRunAnchor(JID);
    expect(currentRunAnchor(JID)).toBeUndefined();
  });

  it('chats are independent', () => {
    beginRunAnchor(JID, '189');
    beginRunAnchor(OTHER, '7');
    advanceRunAnchor(JID, '190');
    expect(currentRunAnchor(JID)).toBe('190');
    expect(currentRunAnchor(OTHER)).toBe('7');
    clearRunAnchor(OTHER);
    expect(currentRunAnchor(JID)).toBe('190');
    expect(currentRunAnchor(OTHER)).toBeUndefined();
  });
});
