import type { RecipeVersionOut } from '../../../core/api/generated';
import { Component, computed, DestroyRef, ElementRef, inject, input } from '@angular/core';

import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RecipesGridElementComponent } from '../recipes-grid-element/recipes-grid-element.component';
import { ElementWidthService } from '../../../core/services/element-width.service';
import { RecipesGridControlsService } from '../../services/recipes-grid-controls.service';


@Component({
  selector: 'app-recipes-grid',
  imports: [
    RecipesGridElementComponent,
    MatIconModule,
    MatButtonModule,
    RouterLink
],
  templateUrl: './recipes-grid.component.html',
  styleUrl: './recipes-grid.component.scss',
})
export class RecipesGridComponent {
  private readonly elementWidthService = inject(ElementWidthService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly width = this.elementWidthService.observe(
    this.elementRef.nativeElement,
    this.destroyRef,
  );
  readonly recipesGridControlsService = inject(RecipesGridControlsService);
  readonly recipeVersions = input<RecipeVersionOut[]>([]);

  displayedRecipeVersions = computed((): RecipeVersionOut[] => {
    let recipeVersions = this.recipeVersions();
    recipeVersions = this.filterRecipeVersionsByName(recipeVersions);
    recipeVersions = this.sortRecipeVersions(recipeVersions);
    return recipeVersions;
  });

  displayedColumns = computed((): number => {
    const width = this.width();
    if (width < 600) {
      return 2;
    } else if (width < 900) {
      return 3;
    } else {
      return 4;
    }
  });

  filterRecipeVersionsByName(recipeVersions: RecipeVersionOut[]): RecipeVersionOut[] {
    const searchBy = this.recipesGridControlsService.searchBy();
    return searchBy === ''
      ? recipeVersions
      : recipeVersions.filter(
          (recipeVersion) => recipeVersion.name.toLowerCase().includes(searchBy.toLowerCase())
        );
  }

  sortRecipeVersions(recipeVersions: RecipeVersionOut[]): RecipeVersionOut[] {
    return [...recipeVersions].sort((a, b) => {
      const modifiedOrder = Date.parse(b.lastModified) - Date.parse(a.lastModified);
      return modifiedOrder !== 0 ? modifiedOrder : b.recipeVersionId.localeCompare(a.recipeVersionId);
    });
  }

  recipeVersionLink(recipeVersion: RecipeVersionOut): string[] {
    return recipeVersion.state === 'active'
      ? ['/recipes', recipeVersion.recipeLineageId]
      : ['/recipes', recipeVersion.recipeLineageId, 'versions', recipeVersion.recipeVersionId];
  }
}
