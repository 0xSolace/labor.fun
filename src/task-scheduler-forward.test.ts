import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _initTestDatabase, createTask, getTaskById } from './db.js';

// What the (mocked) container run hands back through the streaming callback.
const run = vi.hoisted(() => ({ result: '' }));

vi.mock('./container-runner.js', () => ({
  writeTasksSnapshot: vi.fn(),
  runContainerAgent: vi.fn(
    async (
      _group: unknown,
      _input: unknown,
      _onProcess: unknown,
      onOutput: (o: { status: string; result: string | null }) => Promise<void>,
    ) => {
      await onOutput({ status: 'success', result: run.result });
      return { status: 'success', result: run.result };
    },
  ),
}));

// runTask mkdirs the group folder; keep that out of the repo.
vi.mock('./group-folder.js', async () => {
  const os = await import('os');
  return { resolveGroupFolderPath: () => os.tmpdir() };
});

import {
  _resetSchedulerLoopForTests,
  startSchedulerLoop,
} from './task-scheduler.js';

const JID = 'tg:-1003686659419';
const FOLDER = 'house';

function createDueTask(id: string): void {
  createTask({
    id,
    group_folder: FOLDER,
    chat_jid: JID,
    prompt: 'post the rotation',
    schedule_type: 'once',
    schedule_value: '2026-09-14T08:00:00',
    context_mode: 'isolated',
    next_run: new Date(Date.now() - 60_000).toISOString(),
    status: 'active',
    created_at: '2026-09-13T00:00:00.000Z',
  });
}

async function runDueTasks(
  sendMessage: (jid: string, text: string) => Promise<void>,
): Promise<void> {
  startSchedulerLoop({
    registeredGroups: () => ({
      [JID]: {
        name: 'House',
        folder: FOLDER,
        trigger: '@Salem',
        added_at: '2026-09-01T00:00:00.000Z',
      } as any,
    }),
    getSessions: () => ({}),
    queue: {
      enqueueTask: (_jid: string, _id: string, fn: () => Promise<void>) => {
        void fn();
      },
      closeStdin: vi.fn(),
      notifyIdle: vi.fn(),
    } as any,
    onProcess: () => {},
    sendMessage,
  });
  await vi.advanceTimersByTimeAsync(10);
}

describe('scheduled task result forwarding', () => {
  beforeEach(() => {
    _initTestDatabase();
    _resetSchedulerLoopForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses a usage-limit notice and records the run as an error (2026-09-11)', async () => {
    run.result = "You've hit your limit · resets 10pm (America/New_York)";
    createDueTask('t-limit');
    const sendMessage = vi.fn(async () => {});

    await runDueTasks(sendMessage);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(getTaskById('t-limit')?.last_result).toBe(
      "Error: You've hit your limit · resets 10pm (America/New_York)",
    );
  });

  it('classifies what is left after stripping <internal> blocks', async () => {
    // Anchored pattern: the raw string starts with "<internal>", so this is
    // only suppressed if the guard classifies the stripped text.
    run.result =
      "<internal>checked the rotation file</internal>You've hit your limit · resets 10pm (America/New_York)";
    createDueTask('t-internal-then-limit');
    const sendMessage = vi.fn(async () => {});

    await runDueTasks(sendMessage);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(getTaskById('t-internal-then-limit')?.last_result).toBe(
      "Error: You've hit your limit · resets 10pm (America/New_York)",
    );
  });

  it('still forwards a normal result verbatim', async () => {
    run.result =
      'today: Annica @OnigiriCh4n on garbage, Shadow @shad0w on fridge check';
    createDueTask('t-normal');
    const sendMessage = vi.fn(async () => {});

    await runDueTasks(sendMessage);

    expect(sendMessage).toHaveBeenCalledWith(JID, run.result);
    expect(getTaskById('t-normal')?.last_result).toBe(run.result);
  });

  it('still forwards an internal-only result for the channel layer to strip', async () => {
    run.result = '<internal>not a rotation day, nothing to post</internal>';
    createDueTask('t-internal-only');
    const sendMessage = vi.fn(async () => {});

    await runDueTasks(sendMessage);

    expect(sendMessage).toHaveBeenCalledWith(JID, run.result);
  });
});
