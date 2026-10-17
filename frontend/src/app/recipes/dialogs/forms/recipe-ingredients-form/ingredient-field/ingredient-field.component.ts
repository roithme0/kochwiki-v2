import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import type { FoodstuffOut } from '../../../../../core/api/generated';

@Component({
  selector: 'app-ingredient-field',
  imports: [ReactiveFormsModule, MatInputModule, MatFormFieldModule],
  templateUrl: './ingredient-field.component.html',
  styleUrl: './ingredient-field.component.scss',
})
export class IngredientFieldComponent {
  readonly foodstuff = input.required<FoodstuffOut | undefined>();
  readonly amountControl = input.required<FormControl<number | null>>();
  readonly index = input.required<number>();
}
