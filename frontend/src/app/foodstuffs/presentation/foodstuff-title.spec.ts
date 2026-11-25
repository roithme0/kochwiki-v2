import { describe, expect, it } from 'vitest';
import { foodstuffTitle } from './foodstuff-title';

describe('foodstuffTitle', () => {
  it('joins details with a comma and space', () => {
    expect(foodstuffTitle({ name: 'Apfel', details: 'roh' })).toBe(
      'Apfel, roh',
    );
  });

  it.each([null, ''])(
    'omits the separator for absent details (%s)',
    (details) => {
      expect(foodstuffTitle({ name: 'Apfel', details })).toBe('Apfel');
    },
  );
});
