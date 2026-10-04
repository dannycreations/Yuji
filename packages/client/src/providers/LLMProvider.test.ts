import { describe, expect, test } from 'bun:test';

import { accumulateToolCallDeltas } from '@yuji/client/providers/LLMProvider';

describe('accumulateToolCallDeltas', () => {
  test('keeps each call at the index the provider assigned', () => {
    const calls = accumulateToolCallDeltas(
      [],
      [
        { index: 1, id: 'call_b', function: { name: 'search_file', arguments: '{"path' } },
        { index: 0, id: 'call_a', function: { name: 'read_file', arguments: '{}' } },
      ],
    );

    expect(calls[0]?.id).toBe('call_a');
    expect(calls[1]?.id).toBe('call_b');
  });

  test('appends fragments of a later delta to the call it already started', () => {
    const calls = accumulateToolCallDeltas(
      [],
      [
        { index: 0, id: 'call_a', function: { name: 'read_', arguments: '{"path' } },
        { index: 0, function: { name: 'file', arguments: '":"C:/a.ts"}' } },
      ],
    );

    expect(calls).toEqual([
      {
        id: 'call_a',
        type: 'function',
        function: { name: 'read_file', arguments: '{"path":"C:/a.ts"}' },
      },
    ]);
  });

  test('skips deltas without an index', () => {
    const calls = accumulateToolCallDeltas([], [{ id: 'call_a', function: { name: 'read_file', arguments: '{}' } }]);

    expect(calls).toHaveLength(0);
  });
});
