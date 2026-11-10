import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { RecipePresentation } from '../../models/recipe-presentation';
import { IngredientsListComponent } from '../ingredients-list/ingredients-list.component';

@Component({
  selector: 'app-ingredients-card',
  imports: [MatCardModule, IngredientsListComponent],
  templateUrl: './ingredients-card.component.html',
  styleUrl: './ingredients-card.component.scss',
})
export class IngredientsCardComponent {
  readonly recipe = input.required<RecipePresentation>();
}
