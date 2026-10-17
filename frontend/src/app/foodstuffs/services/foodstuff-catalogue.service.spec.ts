import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type { FoodstuffOut } from '../../core/api/generated';
import { FoodstuffBackendService } from './foodstuff-backend.service';
import { FoodstuffCatalogueService } from './foodstuff-catalogue.service';

const foodstuff: FoodstuffOut = {
  id: 1,
  name: 'Pasta',
  brand: null,
  unit: 'G',
  unitVerbose: 'g',
  kcal: null,
  carbs: null,
  protein: null,
  fat: null,
  recipeVersionIds: [],
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('FoodstuffCatalogueService', () => {
  let changes: Subject<void>;
  const getAllFoodstuffs = vi.fn<() => Promise<FoodstuffOut[]>>();

  beforeEach(() => {
    changes = new Subject<void>();
    getAllFoodstuffs.mockReset().mockResolvedValue([foodstuff]);
    TestBed.configureTestingModule({
      providers: [
        FoodstuffCatalogueService,
        {
          provide: FoodstuffBackendService,
          useValue: { getAllFoodstuffs, foodstuffsChanged$: changes },
        },
      ],
    });
  });

  it('loads initially, refreshes after notifications, and retains data while loading or on failure', async () => {
    const catalogue = TestBed.inject(FoodstuffCatalogueService);
    expect(catalogue.state()).toEqual({ status: 'loading', data: [] });
    await Promise.resolve();
    expect(catalogue.state()).toEqual({ status: 'success', data: [foodstuff] });
    const request = deferred<FoodstuffOut[]>();
    getAllFoodstuffs.mockReturnValueOnce(request.promise);
    const failed = vi.fn();
    catalogue.loadFailed$.subscribe(failed);
    changes.next();
    expect(catalogue.state()).toEqual({ status: 'loading', data: [foodstuff] });
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      request.reject(new Error('unavailable'));
      await Promise.resolve();
      expect(catalogue.state()).toEqual({ status: 'error', data: [foodstuff] });
      expect(failed).toHaveBeenCalledOnce();
      await catalogue.refresh();
      expect(catalogue.state()).toEqual({
        status: 'success',
        data: [foodstuff],
      });
    } finally {
      error.mockRestore();
    }
  });

  it('ignores superseded successes and failures without emitting a stale error', async () => {
    const initial = deferred<FoodstuffOut[]>();
    getAllFoodstuffs.mockReturnValueOnce(initial.promise);
    const catalogue = TestBed.inject(FoodstuffCatalogueService);
    const failed = vi.fn();
    catalogue.loadFailed$.subscribe(failed);
    await catalogue.refresh();
    initial.resolve([]);
    await Promise.resolve();
    expect(catalogue.foodstuffs()).toEqual([foodstuff]);
    const older = deferred<FoodstuffOut[]>();
    getAllFoodstuffs.mockReturnValueOnce(older.promise);
    const pending = catalogue.refresh();
    await catalogue.refresh();
    older.reject(new Error('stale failure'));
    await pending;
    expect(catalogue.state().status).toBe('success');
    expect(failed).not.toHaveBeenCalled();
  });

  it('updates records by identity without duplicates and preserves the load status', async () => {
    const catalogue = TestBed.inject(FoodstuffCatalogueService);
    await Promise.resolve();
    const updated = { ...foodstuff, name: 'Pasta neu' };
    catalogue.upsert(updated);
    catalogue.upsert(updated);
    catalogue.upsert({ ...foodstuff, id: 2 });
    expect(catalogue.state()).toEqual({
      status: 'success',
      data: [updated, { ...foodstuff, id: 2 }],
    });
  });

  it('isolates component instances and ignores notifications and pending results after destruction', async () => {
    const parent = TestBed.inject(EnvironmentInjector);
    const firstInjector = createEnvironmentInjector(
      [FoodstuffCatalogueService],
      parent,
    );
    const secondInjector = createEnvironmentInjector(
      [FoodstuffCatalogueService],
      parent,
    );
    try {
      const first = firstInjector.get(FoodstuffCatalogueService);
      const second = secondInjector.get(FoodstuffCatalogueService);
      await Promise.resolve();
      first.upsert({ ...foodstuff, id: 2 });
      expect(first.foodstuffs()).toHaveLength(2);
      expect(second.foodstuffs()).toHaveLength(1);
      const request = deferred<FoodstuffOut[]>();
      getAllFoodstuffs.mockReturnValueOnce(request.promise);
      const pending = first.refresh();
      firstInjector.destroy();
      changes.next();
      expect(getAllFoodstuffs).toHaveBeenCalledTimes(4);
      request.resolve([]);
      await pending;
      expect(first.foodstuffs()).toHaveLength(2);
      secondInjector.destroy();
      changes.next();
      expect(getAllFoodstuffs).toHaveBeenCalledTimes(4);
    } finally {
      if (!firstInjector.destroyed) firstInjector.destroy();
      if (!secondInjector.destroyed) secondInjector.destroy();
    }
  });
});
