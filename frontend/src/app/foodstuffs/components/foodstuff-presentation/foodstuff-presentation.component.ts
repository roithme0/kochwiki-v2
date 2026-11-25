import { Component, computed, inject, input } from '@angular/core';
import { DisplayImageComponent } from '../../../core/components/display-image/display-image.component';
import { foodstuffImagePlaceholder } from '../../../core/constants/image-assets';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { NutritionCardComponent } from '../../../core/components/nutrition-card/nutrition-card.component';
import type { Unit } from '../../../core/api/generated';
import type { FoodstuffPresentation } from '../../presentation/foodstuff-artifact';
import { NutritionSummaryPipe } from '../../../core/pipes/nutrition-summary.pipe';

const NUTRITION_BASIS: Record<Unit, string> = {
  G: 'pro 100 g',
  ML: 'pro 100 ml',
  PIECE: 'pro St\u00fcck',
};

@Component({
  selector: 'app-foodstuff-presentation',
  imports: [
    DisplayImageComponent,
    NutritionCardComponent,
    NutritionSummaryPipe,
  ],
  templateUrl: './foodstuff-presentation.component.html',
  styleUrl: './foodstuff-presentation.component.scss',
})
export class FoodstuffPresentationComponent {
  readonly foodstuff = input.required<FoodstuffPresentation>();

  readonly images = inject(FoodstuffImageService);

  readonly placeholder = foodstuffImagePlaceholder;

  readonly imageUrl = computed(() => {
    const imageId = this.foodstuff().imageId;
    return imageId === null ? null : this.images.contentUrl(imageId);
  });
  readonly basis = computed(() => NUTRITION_BASIS[this.foodstuff().unit]);
}
