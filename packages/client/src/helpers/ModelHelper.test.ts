import { describe, expect, test } from 'bun:test';

import { getFilteredModels } from '@yuji/client/helpers/ModelHelper';

import type { Model } from '@yuji/client/app/Schema';

const model = (id: string): Model => ({ id, name: id, color: '' });

describe('getFilteredModels', () => {
  const models = [model('zeta'), model('alpha'), model('mid')];

  test('hides disabled models by default', () => {
    expect(getFilteredModels(models, ['alpha'], '').map((m) => m.id)).toEqual(['mid', 'zeta']);
  });

  test('sorts by name, matching on either name or id', () => {
    expect(getFilteredModels(models, [], '').map((m) => m.id)).toEqual(['alpha', 'mid', 'zeta']);
    expect(getFilteredModels(models, [], 'AL').map((m) => m.id)).toEqual(['alpha']);
  });

  test('pushes disabled models to the end when they are included', () => {
    expect(getFilteredModels(models, ['alpha'], '', { includeDisabled: true }).map((m) => m.id)).toEqual(['mid', 'zeta', 'alpha']);
  });
});
