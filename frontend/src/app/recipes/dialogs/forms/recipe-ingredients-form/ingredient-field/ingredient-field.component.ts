import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import type { FoodstuffSummaryOut } from '../../../../../core/api/generated';
import { FoodstuffImageComponent } from '../../../../../foodstuffs/components/foodstuff-image/foodstuff-image.component';

@Component({
  selector: 'app-ingredient-field',
  imports: [
    ReactiveFormsModule,
    MatInputModule,
    MatFormFieldModule,
    FoodstuffImageComponent,
  ],
  templateUrl: './ingredient-field.component.html',
  styleUrl: './ingredient-field.component.scss',
})
export class IngredientFieldComponent {
  readonly foodstuff = input.required<FoodstuffSummaryOut | undefined>();
  readonly amountControl = input.required<FormControl<number | null>>();
  readonly index = input.required<number>();
}
