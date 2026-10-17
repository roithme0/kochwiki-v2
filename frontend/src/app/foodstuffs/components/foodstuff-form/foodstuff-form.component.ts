import { ImageEditorComponent } from '../../../core/components/image-editor/image-editor.component';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { toNutritionSummary } from '../../../core/models/nutrition-result';
import { ImageEditorState } from '../../../core/services/image-editor-state.service';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type {
  FoodstuffCreate,
  FoodstuffOut,
  Unit,
} from '../../../core/api/generated';
import {
  foodstuffFieldLabels,
  foodstuffUnitChoices,
} from '../../models/foodstuff-labels';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';

@Component({
  selector: 'app-foodstuff-form',
  providers: [ImageEditorState],
  imports: [
    ImageEditorComponent,
    MacroChartComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatCardModule,
  ],
  templateUrl: './foodstuff-form.component.html',
  styleUrl: './foodstuff-form.component.scss',
})
export class FoodstuffFormComponent {
  private readonly fb = inject(FormBuilder);
  readonly image = inject(ImageEditorState);
  private readonly destroyRef = inject(DestroyRef);

  readonly foodstuff = input<Partial<FoodstuffOut> | null>(null);
  readonly submitLabel = input.required<string>();
  readonly submitted = output<FoodstuffCreate>();
  readonly submitting = input(false);

  readonly uploadingChanged = output<boolean>();

  readonly busy = this.image.busy;

  readonly unitChoices = foodstuffUnitChoices;
  readonly fieldLabels = foodstuffFieldLabels;

  readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', Validators.required.bind(Validators)),
    brand: this.fb.control<string | null>(''),
    unit: this.fb.control<Unit | null>(
      null,
      Validators.required.bind(Validators),
    ),
    kcal: this.fb.control<number | null>(null),
    carbs: this.fb.control<number | null>(null),
    protein: this.fb.control<number | null>(null),
    fat: this.fb.control<number | null>(null),
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly nutrition = computed(() => toNutritionSummary(this.formValue()));

  constructor() {
    effect(() => {
      const foodstuff = this.foodstuff();
      if (foodstuff) this.form.patchValue(foodstuff);
    });
    effect(() => {
      if (this.busy()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
    this.image.connect(
      inject(FoodstuffImageService),
      computed(() => this.foodstuff()?.imageId ?? null),
      this.submitting,
    );
    this.image.preparingChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((busy) => this.uploadingChanged.emit(busy));
  }

  async onSubmit(): Promise<void> {
    if (this.busy() || this.image.invalidImageSelection()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, brand, unit, kcal, carbs, protein, fat } =
      this.form.getRawValue();
    if (unit === null) return;
    await this.image.submit((imageIdChange) => {
      this.submitted.emit({
        name,
        brand,
        unit,
        kcal,
        carbs,
        protein,
        fat,
        ...(imageIdChange === undefined ? {} : { imageId: imageIdChange }),
      });
    });
  }
}
