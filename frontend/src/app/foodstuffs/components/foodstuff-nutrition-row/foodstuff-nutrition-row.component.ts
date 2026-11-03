import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-foodstuff-nutrition-row',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './foodstuff-nutrition-row.component.html',
  styleUrl: './foodstuff-nutrition-row.component.scss',
})
export class FoodstuffNutritionRowComponent {
  readonly label = input.required<string>();
  readonly control = input.required<FormControl<number | null>>();
  readonly color = input<string | null>(null);
}
