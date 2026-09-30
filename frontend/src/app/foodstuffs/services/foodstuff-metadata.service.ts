import {
  Injectable,
  Signal,
  WritableSignal,
  inject,
  signal,
} from '@angular/core';
import { SnackBarService } from '../../core/services/snack-bar.service';
import type {
  FoodstuffUnitChoices,
  FoodstuffVerboseNames,
} from '../../core/api/generated';
import { FoodstuffBackendService } from './foodstuff-backend.service';

@Injectable({ providedIn: 'root' })
export class FoodstuffMetadataService {
  private readonly foodstuffBackendService = inject(FoodstuffBackendService);
  private readonly snackBarService = inject(SnackBarService);

  private readonly _verboseNames: WritableSignal<FoodstuffVerboseNames | null> =
    signal(null);
  private readonly _unitChoices: WritableSignal<FoodstuffUnitChoices | null> =
    signal(null);

  constructor() {
    void this.fetchMetadata();
  }

  get verboseNames(): Signal<FoodstuffVerboseNames | null> {
    return this._verboseNames;
  }

  get unitChoices(): Signal<FoodstuffUnitChoices | null> {
    return this._unitChoices;
  }

  private async fetchMetadata(): Promise<void> {
    try {
      const [verboseNames, unitChoices] = await Promise.all([
        this.foodstuffBackendService.fetchFoodstuffVerboseNames(),
        this.foodstuffBackendService.fetchFoodstuffUnitChoices(),
      ]);
      this._verboseNames.set(verboseNames);
      this._unitChoices.set(unitChoices);
    } catch (error: unknown) {
      console.error('failed to fetch foodstuff metadata: ', error);
      this.snackBarService.open(
        'Metadaten für Lebensmittel konnten nicht geladen werden'
      );
    }
  }
}
