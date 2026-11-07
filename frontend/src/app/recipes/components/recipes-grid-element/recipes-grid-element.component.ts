import { RecipeImageService } from '../../services/recipe-image.service';
import { recipeImagePlaceholder } from '../../../core/constants/image-assets';
import type { RecipeVersionOut } from '../../../core/api/generated';
import { Component, computed, inject, input } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { DisplayImageComponent } from '../../../core/components/display-image/display-image.component';
import { RecipeVersionStateBadgeComponent } from '../../components/recipe-version-state-badge/recipe-version-state-badge.component';

@Component({
  selector: 'app-recipes-grid-element',
  imports: [
    MatCardModule,
    DisplayImageComponent,
    RecipeVersionStateBadgeComponent,
  ],
  templateUrl: './recipes-grid-element.component.html',
  styleUrl: './recipes-grid-element.component.scss',
})
export class RecipesGridElementComponent {
  readonly images = inject(RecipeImageService);
  readonly placeholder = recipeImagePlaceholder;

  recipeVersion = input.required<RecipeVersionOut>();
  readonly imageUrl = computed(() => {
    const id = this.recipeVersion().imageId;
    return id === null ? null : this.images.contentUrl(id);
  });
  readonly aspectRatio = computed(() => {
    const dimensions = this.recipeVersion().imageDimensions;
    return dimensions
      ? `${dimensions.width} / ${dimensions.height}`
      : '1254 / 747';
  });
}
