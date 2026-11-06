import { Component, input } from '@angular/core';
import { FoodstuffImageComponent } from '../foodstuff-image/foodstuff-image.component';

export interface FoodstuffDisplay {
  name: string;
  imageId: string | null;
  details: string | null;
  brand?: string | null;
}

@Component({
  selector: 'app-foodstuff-display',
  imports: [FoodstuffImageComponent],
  templateUrl: './foodstuff-display.component.html',
  styleUrl: './foodstuff-display.component.scss',
})
export class FoodstuffDisplayComponent {
  readonly foodstuff = input.required<FoodstuffDisplay>();
  readonly showBrand = input(false);
}
