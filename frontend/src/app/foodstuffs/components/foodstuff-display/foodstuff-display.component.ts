import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { foodstuffImagePlaceholder } from '../../../core/constants/image-assets';
import { Component, computed, inject, input } from '@angular/core';
import { DisplayImageComponent } from '../../../core/components/display-image/display-image.component';

export interface FoodstuffDisplay {
  name: string;
  imageId: string | null;
  details: string | null;
  brand?: string | null;
}

@Component({
  selector: 'app-foodstuff-display',
  imports: [DisplayImageComponent],
  templateUrl: './foodstuff-display.component.html',
  styleUrl: './foodstuff-display.component.scss',
})
export class FoodstuffDisplayComponent {
  readonly images = inject(FoodstuffImageService);
  readonly placeholder = foodstuffImagePlaceholder;

  readonly foodstuff = input.required<FoodstuffDisplay>();
  readonly imageUrl = computed(() => {
    const id = this.foodstuff().imageId;
    return id === null ? null : this.images.contentUrl(id);
  });
  readonly showBrand = input(false);
}
