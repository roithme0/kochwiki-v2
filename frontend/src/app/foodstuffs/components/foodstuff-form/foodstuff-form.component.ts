
import { Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { FoodstuffCreate, FoodstuffOut, Unit } from '../../../core/api/generated';
import { foodstuffFieldLabels, foodstuffUnitChoices } from '../../models/foodstuff-labels';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-foodstuff-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  templateUrl: './foodstuff-form.component.html',
  styleUrl: './foodstuff-form.component.scss',
})
export class FoodstuffFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly foodstuff = input<Partial<FoodstuffOut> | null>(null);
  readonly submitLabel = input.required<string>();
  readonly submitted = output<FoodstuffCreate>();

  readonly unitChoices = foodstuffUnitChoices;
  readonly fieldLabels = foodstuffFieldLabels;

  readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', Validators.required),
    brand: this.fb.control<string | null>(''),
    unit: this.fb.control<Unit | null>(null, Validators.required),
    kcal: this.fb.control<number | null>(null),
    carbs: this.fb.control<number | null>(null),
    protein: this.fb.control<number | null>(null),
    fat: this.fb.control<number | null>(null),
  });

  constructor() {
    effect(() => {
      const foodstuff = this.foodstuff();
      if (foodstuff) this.form.patchValue(foodstuff);
    });
  }

  onSubmit(): void {
    const { name, brand, unit, kcal, carbs, protein, fat } =
      this.form.getRawValue();
    if (unit === null) return;
    this.submitted.emit({ name, brand, unit, kcal, carbs, protein, fat });
  }

}
