import { describe, expect, test } from 'bun:test';

import { getFlattenedThreads } from '@yuji/client/helpers/ThreadHelper';

import type { ThreadMetadata } from '@yuji/client/app/Schema';

const DAY_MS = 86_400_000;

const thread = (id: string, daysAgo: number, extra: Partial<ThreadMetadata> = {}): ThreadMetadata => ({
  id,
  title: id,
  mode: 'chat',
  createdAt: 0,
  updatedAt: Date.now() - daysAgo * DAY_MS,
  ...extra,
});

type Flattened = ReturnType<typeof getFlattenedThreads>;

const labelsOf = (items: Flattened) => items.flatMap((item) => (item.type === 'label' ? [item.label] : []));

const idsOf = (items: Flattened) => items.flatMap((item) => (item.type === 'thread' ? [item.thread.id] : []));

describe('getFlattenedThreads', () => {
  test('buckets by recency with pinned first, and drops archived threads', () => {
    const items = getFlattenedThreads(
      [
        thread('old', 20),
        thread('thisWeek', 4),
        thread('today', 0),
        thread('yesterday', 1),
        thread('pinnedOld', 20),
        thread('archived', 0, { archived: true }),
      ],
      '',
      ['pinnedOld'],
    );

    expect(labelsOf(items)).toEqual(['Pinned', 'Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days']);
    expect(idsOf(items)).toEqual(['pinnedOld', 'today', 'yesterday', 'thisWeek', 'old']);
  });

  test('keeps only threads whose title matches the query', () => {
    const items = getFlattenedThreads([thread('alpha', 0), thread('beta', 0)], ' AL ');

    expect(idsOf(items)).toEqual(['alpha']);
  });
});
