import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import type { FoodstuffOut } from '../../core/api/generated';
import type { LoadState } from '../../core/utils/load-state';
import { FoodstuffBackendService } from './foodstuff-backend.service';

@Injectable()
export class FoodstuffCatalogueService {
  private readonly backend = inject(FoodstuffBackendService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly loadState = signal<LoadState<FoodstuffOut[]>>({
    status: 'loading',
    data: [],
  });
  private readonly loadFailed = new Subject<void>();
  private requestId = 0;

  readonly state = this.loadState.asReadonly();
  readonly foodstuffs = computed(() => this.state().data);
  readonly loadFailed$ = this.loadFailed.asObservable();

  constructor() {
    this.backend.foodstuffsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refresh());
    this.destroyRef.onDestroy(() => this.loadFailed.complete());
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const request = ++this.requestId;
    this.loadState.update(({ data }) => ({ status: 'loading', data }));
    try {
      const foodstuffs = await this.backend.getAllFoodstuffs();
      if (this.destroyRef.destroyed || request !== this.requestId) return;
      this.loadState.set({ status: 'success', data: foodstuffs });
    } catch (error: unknown) {
      if (this.destroyRef.destroyed || request !== this.requestId) return;
      console.error('failed to fetch foodstuffs: ', error);
      this.loadState.update(({ data }) => ({ status: 'error', data }));
      this.loadFailed.next();
    }
  }

  upsert(foodstuff: FoodstuffOut): void {
    this.loadState.update((state) => ({
      ...state,
      data: [
        ...state.data.filter((item) => item.id !== foodstuff.id),
        foodstuff,
      ],
    }));
  }
}
