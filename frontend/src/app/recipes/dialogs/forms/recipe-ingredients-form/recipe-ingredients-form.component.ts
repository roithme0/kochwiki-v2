import type { OnInit } from '@angular/core';
import type {
  IngredientOut,
  RecipeVersionOut,
} from '../../../../core/api/generated';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
  Validators,
  FormBuilder,
} from '@angular/forms';
import type { FoodstuffSummaryOut } from '../../../../core/api/generated';
import {
  FoodstuffSelectionDialogComponent,
  FoodstuffSelectionDialogData,
} from '../../../../foodstuffs/dialogs/foodstuff-selection-dialog/foodstuff-selection-dialog.component';
import { IngredientFieldComponent } from './ingredient-field/ingredient-field.component';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { buildNutritionLegend } from '../../../../core/utils/nutrition-legend';
import { ChartLegendElementComponent } from '../../../../core/components/chart-legend-element/chart-legend-element.component';
import { MacroChartComponent } from '../../../../core/components/macro-chart/macro-chart.component';
import {
  DraftIngredientNutrition,
  DraftNutritionState,
  calculateDraftNutrition,
} from '../../../utils/recipe-nutrition';

interface IngredientFormControls {
  index: FormControl<number | null>;
  foodstuffId: FormControl<number | null>;
  amount: FormControl<number | null>;
}

@Component({
  selector: 'app-recipe-ingredients-form',
  imports: [
    IngredientFieldComponent,
    MatButtonModule,
    ReactiveFormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatExpansionModule,
    ChartLegendElementComponent,
    MacroChartComponent,
  ],
  templateUrl: './recipe-ingredients-form.component.html',
  styleUrl: './recipe-ingredients-form.component.scss',
})
export class RecipeIngredientsFormComponent implements OnInit {
  recipeVersion = input<RecipeVersionOut>();

  readonly selectedFoodstuffs = signal<FoodstuffSummaryOut[]>([]);

  readonly recipeFormDirective = inject(FormGroupDirective);
  readonly fb: FormBuilder = inject(FormBuilder);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly destroyRef = inject(DestroyRef);

  recipeForm!: FormGroup;
  ingredientsFormGroup!: FormGroup;
  readonly ingredientDrafts = signal<DraftIngredientNutrition[]>([]);
  readonly nutritionState = computed((): DraftNutritionState =>
    calculateDraftNutrition(
      this.ingredientDrafts(),
      this.servings(),
      this.selectedFoodstuffs(),
    ),
  );
  readonly legend = computed(() => {
    const state = this.nutritionState();
    return state.status === 'ready'
      ? Object.values(buildNutritionLegend(state.nutrition))
      : [];
  });

  private readonly servings = signal<number | null>(null);

  ngOnInit(): void {
    this.recipeForm = this.recipeFormDirective.control;
    this.ingredientsFormGroup = this.recipeForm.get(
      'ingredientsFormGroup',
    ) as FormGroup;

    const recipeVersion: RecipeVersionOut | undefined = this.recipeVersion();
    if (recipeVersion != undefined) {
      this.recipeForm.get('ingredientsFormGroup')?.patchValue({
        servings: recipeVersion.servings,
      });
      recipeVersion.ingredients.forEach((ingredient: IngredientOut) =>
        this.addIngredient(ingredient.foodstuff, ingredient.amount),
      );
    }

    this.ingredientsFormGroup.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateNutritionDraft());
    this.updateNutritionDraft();
  }

  get ingredients(): FormArray<FormGroup<IngredientFormControls>> {
    return this.ingredientsFormGroup.get('ingredients') as FormArray<
      FormGroup<IngredientFormControls>
    >;
  }

  addIngredient(
    foodstuff: FoodstuffSummaryOut,
    amount: number | null = null,
  ): void {
    this.selectedFoodstuffs.update((foodstuffs) => [
      ...foodstuffs.filter((item) => item.id !== foodstuff.id),
      foodstuff,
    ]);
    this.ingredients.push(
      this.fb.group({
        index: [
          this.ingredients.length + 1,
          Validators.required.bind(Validators),
        ],
        foodstuffId: [foodstuff.id, Validators.required.bind(Validators)],
        amount: [amount, Validators.required.bind(Validators)],
      }),
    );
    this.updateNutritionDraft();
  }

  foodstuffFor(id: number | null): FoodstuffSummaryOut | undefined {
    return this.selectedFoodstuffs().find((foodstuff) => foodstuff.id === id);
  }

  removeIngredient(index: number): void {
    this.ingredients.removeAt(index);
    this.reindexIngredients();
    const remainingIds = new Set(
      this.ingredients.controls.map((row) => row.controls.foodstuffId.value),
    );
    this.selectedFoodstuffs.update((foodstuffs) =>
      foodstuffs.filter((foodstuff) => remainingIds.has(foodstuff.id)),
    );
    this.updateNutritionDraft();
  }

  openFoodstuffSelectionDialog(): void {
    const dialogRef = this.dialog.open<
      FoodstuffSelectionDialogComponent,
      FoodstuffSelectionDialogData,
      FoodstuffSummaryOut[]
    >(FoodstuffSelectionDialogComponent, {
      data: {
        existingFoodstuffIds: this.ingredientDrafts()
          .map((ingredient) => ingredient.foodstuffId)
          .filter((id): id is number => id !== null),
      },
      ariaLabel: 'Zutat hinzufügen',
      width: '100vw',
      maxWidth: 'min(var(--app-max-width), 100vw)',
      height: '100dvh',
      maxHeight: '100dvh',
      position: { top: '0' },
      autoFocus: false,
    });
    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((foodstuffs) => {
        if (!foodstuffs?.length) return;
        const existingIds = new Set(
          this.ingredientDrafts().map((ingredient) => ingredient.foodstuffId),
        );
        for (const foodstuff of foodstuffs) {
          if (existingIds.has(foodstuff.id)) continue;
          this.addIngredient(foodstuff);
          existingIds.add(foodstuff.id);
        }
      });
  }

  private updateNutritionDraft(): void {
    const rawValue = this.ingredientsFormGroup.getRawValue() as {
      servings: number | null;
      ingredients: DraftIngredientNutrition[];
    };
    this.servings.set(rawValue.servings);
    this.ingredientDrafts.set(rawValue.ingredients);
  }

  private reindexIngredients(): void {
    this.ingredients.controls.forEach((ingredient, index) => {
      ingredient.get('index')?.setValue(index + 1, { emitEvent: false });
    });
  }
}
