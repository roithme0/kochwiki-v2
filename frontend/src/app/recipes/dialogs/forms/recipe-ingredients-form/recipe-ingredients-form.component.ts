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
import type { FoodstuffOut } from '../../../../core/api/generated';
import { FoodstuffCreateDialogComponent } from '../../../../foodstuffs/dialogs/foodstuff-create-dialog/foodstuff-create-dialog.component';
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
export class RecipeIngredientsFormComponent {
  foodstuffs = input.required<FoodstuffOut[]>();
  recipeVersion = input<RecipeVersionOut>();

  readonly recipeFormDirective = inject(FormGroupDirective);
  readonly fb: FormBuilder = inject(FormBuilder);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly destroyRef = inject(DestroyRef);

  recipeForm!: FormGroup;
  ingredientsFormGroup!: FormGroup;
  readonly ingredientDrafts = signal<DraftIngredientNutrition[]>([]);
  readonly nutritionState = computed(
    (): DraftNutritionState =>
      calculateDraftNutrition(
        this.ingredientDrafts(),
        this.servings(),
        this.foodstuffs(),
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
        this.addIngredient(ingredient.foodstuff.id, ingredient.amount),
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

  addIngredient(foodstuffId: number, amount: number | null = null): void {
    this.ingredients.push(
      this.fb.group({
        index: [this.ingredients.length + 1, Validators.required],
        foodstuffId: [foodstuffId, Validators.required],
        amount: [amount, Validators.required],
      }),
    );
    this.updateNutritionDraft();
  }

  foodstuffFor(id: number | null): FoodstuffOut | undefined {
    return this.foodstuffs().find((foodstuff) => foodstuff.id === id);
  }

  removeIngredient(index: number): void {
    this.ingredients.removeAt(index);
    this.reindexIngredients();
    this.updateNutritionDraft();
  }

  openFoodstuffSelectionDialog(): void {
    this.dialog
      .open<
        FoodstuffSelectionDialogComponent,
        FoodstuffSelectionDialogData,
        number[]
      >(FoodstuffSelectionDialogComponent, {
        data: {
          foodstuffs: this.foodstuffs(),
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
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ids) => {
        if (!ids?.length) return;
        const existingIds = new Set(
          this.ingredientDrafts().map((ingredient) => ingredient.foodstuffId),
        );
        for (const id of ids) {
          if (existingIds.has(id) || !this.foodstuffFor(id)) continue;
          this.addIngredient(id);
          existingIds.add(id);
        }
      });
  }

  openCreateFoodstuffDialog(): void {
    this.dialog.open(FoodstuffCreateDialogComponent, {
      width: '100vw',
      maxWidth: 'min(var(--app-max-width), 100vw)',
      maxHeight: '100dvh',
      position: { top: '0' },
      autoFocus: false,
      disableClose: true,
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
