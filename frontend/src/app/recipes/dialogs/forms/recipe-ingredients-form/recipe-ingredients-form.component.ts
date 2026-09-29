import {
  Component,
  DestroyRef,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
  Validators,
  FormBuilder,
} from '@angular/forms';
import type { FoodstuffOut } from '../../../../core/api/generated';
import { Ingredient } from '../../../models/ingredient';
import { RecipeVersion } from '../../../models/recipe';
import { FoodstuffCreateDialogComponent } from '../../../../foodstuffs/dialogs/foodstuff-create-dialog/foodstuff-create-dialog.component';
import { IngredientFieldComponent } from './ingredient-field/ingredient-field.component';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import { ChartLegendElement } from '../../../../core/models/chart-legend-element';
import { ChartLegendElementComponent } from '../../../../core/components/chart-legend-element/chart-legend-element.component';
import { MacroChartComponent } from '../../../../core/components/macro-chart/macro-chart.component';
import {
  DraftIngredientNutrition,
  DraftNutritionState,
  RecipeNutrition,
  calculateDraftNutrition,
} from '../../../utils/recipe-nutrition';

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
    MatSelectModule,
    ChartLegendElementComponent,
    MacroChartComponent
],
  templateUrl: './recipe-ingredients-form.component.html',
  styleUrl: './recipe-ingredients-form.component.scss',
})
export class RecipeIngredientsFormComponent {
  foodstuffs = input.required<FoodstuffOut[]>();
  recipeVersion = input<RecipeVersion>();

  readonly recipeFormDirective = inject(FormGroupDirective);
  readonly fb: FormBuilder = inject(FormBuilder);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly destroyRef = inject(DestroyRef);

  recipeForm!: FormGroup;
  ingredientsFormGroup!: FormGroup;
  readonly ingredientDrafts = signal<DraftIngredientNutrition[]>([]);
  readonly legend: WritableSignal<Record<string, ChartLegendElement>> = signal({});
  readonly nutritionState = computed((): DraftNutritionState =>
    calculateDraftNutrition(
      this.ingredientDrafts(),
      this.servings(),
      this.foodstuffs()
    )
  );
  readonly displayedNutritionState = computed((): DraftNutritionState => {
    const nutritionState = this.nutritionState();
    const lastValidNutrition = this.lastValidNutrition();

    return nutritionState.status === 'invalid' &&
      this.isEditingNumericInput() &&
      lastValidNutrition !== null
      ? { status: 'complete', nutrition: lastValidNutrition }
      : nutritionState;
  });
  readonly canShowLegend = computed((): boolean => {
    const nutritionState = this.displayedNutritionState();
    return (
      nutritionState.status === 'complete' &&
      (nutritionState.nutrition.carbs !== 0 ||
        nutritionState.nutrition.protein !== 0 ||
        nutritionState.nutrition.fat !== 0)
    );
  });

  private readonly servings = signal<number | null>(null);
  private readonly lastValidNutrition = signal<RecipeNutrition | null>(null);
  private readonly isEditingNumericInput = signal(false);

  constructor() {
    effect(() => {
      const nutritionState = this.nutritionState();
      if (nutritionState.status === 'complete') {
        this.lastValidNutrition.set(nutritionState.nutrition);
      } else if (nutritionState.status === 'incomplete') {
        this.lastValidNutrition.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.recipeForm = this.recipeFormDirective.control;
    this.ingredientsFormGroup = this.recipeForm.get(
      'ingredientsFormGroup'
    ) as FormGroup;

    const recipeVersion: RecipeVersion | undefined = this.recipeVersion();
    if (recipeVersion != undefined) {
      this.recipeForm.get('ingredientsFormGroup')?.patchValue({
        servings: recipeVersion.servings,
      });
      recipeVersion.ingredients.forEach((ingredient: Ingredient) =>
        this.addIngredient(ingredient)
      );
    }
    if (this.ingredients.length === 0) this.addIngredient();

    this.ingredientsFormGroup.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateNutritionDraft());
    this.updateNutritionDraft();
  }

  get ingredients(): FormArray {
    return this.recipeForm.get('ingredientsFormGroup.ingredients') as FormArray;
  }

  addIngredient(ingredient?: Ingredient): void {
    this.ingredients.push(
      this.fb.group({
        index: [this.ingredients.length + 1, Validators.required],
        foodstuffId: [ingredient?.foodstuff.id ?? null, Validators.required],
        amount: [ingredient?.amount ?? null, Validators.required],
      })
    );
    this.updateNutritionDraft();
  }

  removeIngredient(index: number): void {
    this.ingredients.removeAt(index);
    this.reindexIngredients();
    this.updateNutritionDraft();
  }

  onNutritionPreviewFocusIn(event: FocusEvent): void {
    if (isNumericInput(event.target)) this.isEditingNumericInput.set(true);
  }

  onNutritionPreviewFocusOut(event: FocusEvent): void {
    if (!isNumericInput(event.target) || isNumericInput(event.relatedTarget)) {
      return;
    }
    this.isEditingNumericInput.set(false);
    if (this.nutritionState().status === 'invalid') {
      this.lastValidNutrition.set(null);
    }
  }

  openCreateFoodstuffDialog(): void {
    this.dialog.open(FoodstuffCreateDialogComponent, {
      minWidth: 'calc(100vw - 1rem)',
      maxWidth: 'calc(100vw - 1rem)',
      maxHeight: 'calc(100vh - 1rem)',
      position: { top: '0.5rem', left: '0.5rem' },
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

function isNumericInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.type === 'number';
}
