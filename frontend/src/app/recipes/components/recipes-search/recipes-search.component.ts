import type { RecipeVersionOut } from '../../../core/api/generated';

import { Component, computed, inject, input } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RecipesGridControlsService } from '../../services/recipes-grid-controls.service';
import { Router } from '@angular/router';


@Component({
  selector: 'app-recipes-search',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule
],
  templateUrl: './recipes-search.component.html',
  styleUrl: './recipes-search.component.scss',
})
export class RecipesSearchComponent {
  readonly recipesGridControlsService = inject(RecipesGridControlsService);
  readonly router = inject(Router);
  readonly recipeVersions = input<RecipeVersionOut[]>([]);

  readonly nameOptionsGroupLabel: string = 'Namen';
  readonly originOptionsGroupLabel: string = 'Ersteller*innen';

  namesMap = computed(
    (): Map<string, string> =>
      this.recipeVersions().reduce((acc, recipeVersion) => {
        acc.set(recipeVersion.recipeVersionId, recipeVersion.name);
        return acc;
      }, new Map<string, string>())
  );
  readonly recipeVersionsById = computed(
    (): Map<string, RecipeVersionOut> => new Map(this.recipeVersions().map((recipeVersion) => [recipeVersion.recipeVersionId, recipeVersion]))
  );
  origins = computed((): string[] =>
    this.recipeVersions()
      .map((recipeVersion) => recipeVersion.originName || '')
      .filter((origin) => origin != '')
  );
  filteredNamesMap = computed(
    (): Map<string, string> =>
      new Map(
        [...this.namesMap()].filter(([id, name]) =>
          name
            .toLowerCase()
            .includes(this.recipesGridControlsService.searchBy().toLowerCase())
        )
      )
  );
  filteredOrigins = computed(
    (): Set<string> =>
      new Set(
        this.origins().filter((origin) =>
          origin
            .toLowerCase()
            .includes(this.recipesGridControlsService.searchBy().toLowerCase())
        )
      )
  );

  //#region Event Handlers

  onSeachValueChanged(newSearchValue: string): void {
    this.recipesGridControlsService.searchBy = newSearchValue;
  }

  onSearchOptionSelected(event: MatAutocompleteSelectedEvent): void {
    if (event.option.group?.label === this.nameOptionsGroupLabel) {
      const recipeVersion = this.recipeVersionsById().get(event.option.value as string);
      if (recipeVersion !== undefined) {
        void this.router.navigate(
          recipeVersion.state === 'active'
            ? ['recipes', recipeVersion.recipeLineageId]
            : ['recipes', recipeVersion.recipeLineageId, 'versions', recipeVersion.recipeVersionId]
        );
      }
    }
  }

  //#endregion
}
