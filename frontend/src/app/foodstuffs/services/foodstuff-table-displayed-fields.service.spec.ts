import { signal } from '@angular/core';
import { FoodstuffTableDisplayedFieldsService } from './foodstuff-table-displayed-fields.service';

describe('FoodstuffTableDisplayedFieldsService', () => {
  it('updates columns at each existing breakpoint using the supplied width', () => {
    const width = signal(480);
    const fields = new FoodstuffTableDisplayedFieldsService().getDisplayedFields(width);
    const base = ['chart', 'name'];
    const actions = ['edit', 'delete'];

    expect(fields()).toEqual([...base, ...actions]);
    width.set(500);
    expect(fields()).toEqual([...base, ...actions]);
    width.set(501);
    expect(fields()).toEqual([...base, 'brand', ...actions]);
    width.set(700);
    expect(fields()).toEqual([...base, 'brand', ...actions]);
    width.set(701);
    expect(fields()).toEqual([...base, 'brand', 'kcal', ...actions]);
    width.set(1100);
    expect(fields()).toEqual([...base, 'brand', 'kcal', ...actions]);
    width.set(1101);
    expect(fields()).toEqual([...base, 'brand', 'kcal', 'carbs', 'protein', 'fat', ...actions]);
    width.set(1200);
    expect(fields()).not.toContain('unit');
    width.set(1201);
    expect(fields()).toEqual([...base, 'brand', 'kcal', 'carbs', 'protein', 'fat', 'unit', ...actions]);
    width.set(480);
    expect(fields()).toEqual([...base, ...actions]);
  });
});
