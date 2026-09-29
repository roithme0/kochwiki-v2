
import { Component, DestroyRef, ElementRef, QueryList, Renderer2, ViewChild, ViewChildren, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffBackendService } from '../../../foodstuffs/services/foodstuff-backend.service';
import { RecipeVersion, RecipeVersionWrite } from '../../models/recipe';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { SectionNavComponent, SectionNavItem } from '../../../core/components/section-nav/section-nav.component';
import { RecipeIngredientsFormComponent } from '../forms/recipe-ingredients-form/recipe-ingredients-form.component';
import { RecipeMetaFormComponent } from '../forms/recipe-meta-form/recipe-meta-form.component';
import { RecipePreparationFormComponent } from '../forms/recipe-preparation-form/recipe-preparation-form.component';

type RecipeEditorState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; source: 'foodstuffs' | 'recipeVersion' };

type LoadResult<T> =
  | { status: 'success'; value: T }
  | { status: 'error' };

interface RecipeFormControls {
  metaFormGroup: FormGroup<{
    name: FormControl<string | null>;
    originName: FormControl<string | null>;
    originUrl: FormControl<string | null>;
  }>;
  ingredientsFormGroup: FormGroup<{
    servings: FormControl<number | null>;
    ingredients: FormArray<FormGroup<IngredientFormControls>>;
  }>;
  preparationFormGroup: FormGroup<{
    preptime: FormControl<number | null>;
    steps: FormArray<FormGroup<StepFormControls>>;
  }>;
}

interface IngredientFormControls {
  index: FormControl<number | null>;
  foodstuffId: FormControl<number | null>;
  amount: FormControl<number | null>;
}

interface StepFormControls {
  description: FormControl<string | null>;
}

export type RecipeEditorMode = 'create' | 'active' | 'draft';

export interface RecipeEditorSubmission {
  recipeVersion: RecipeVersionWrite;
  action: 'publish' | 'draft';
}

@Component({
  selector: 'app-recipe-editor',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SectionNavComponent,
    RecipeIngredientsFormComponent,
    RecipeMetaFormComponent,
    RecipePreparationFormComponent
],
  templateUrl: './recipe-editor.component.html',
  styleUrl: './recipe-editor.component.scss',
})
export class RecipeEditorComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly foodstuffBackendService = inject(FoodstuffBackendService);
  private readonly recipeBackendService = inject(RecipeBackendService);
  private readonly snackBarService = inject(SnackBarService);
  private readonly renderer = inject(Renderer2);

  @ViewChild('sectionNav', { read: ElementRef }) private sectionNav?: ElementRef<HTMLElement>;
  @ViewChildren('editorSection') private editorSections!: QueryList<ElementRef<HTMLElement>>;
  private scrollContainer?: HTMLElement;
  private removeScrollListener?: () => void;
  private removeTouchMoveListener?: () => void;
  private pendingNavigation: string | null = null;
  private navigationSettledTimer?: ReturnType<typeof setTimeout>;

  readonly recipeLineageId = input<string | null>(null);
  readonly recipeVersionId = input<string | null>(null);
  readonly mode = input<RecipeEditorMode>('create');
  readonly submitting = input(false);
  readonly submitted = output<RecipeEditorSubmission>();
  readonly state = signal<RecipeEditorState>({ status: 'loading' });
  readonly foodstuffs = signal<FoodstuffOut[]>([]);
  readonly recipeVersion = signal<RecipeVersion | null>(null);
  readonly sectionNavItems: readonly SectionNavItem[] = [
    { id: 'basics', label: 'Basis' },
    { id: 'ingredients', label: 'Zutaten' },
    { id: 'preparation', label: 'Zubereitung' },
  ];
  readonly activeSection = signal('basics');

  readonly recipeForm = this.fb.group<RecipeFormControls>({
    metaFormGroup: this.fb.group({
      name: this.fb.control('', Validators.required),
      originName: this.fb.control(''),
      originUrl: this.fb.control(''),
    }),
    ingredientsFormGroup: this.fb.group({
      servings: this.fb.control(2, Validators.required),
      ingredients: this.fb.array<FormGroup<IngredientFormControls>>([]),
    }),
    preparationFormGroup: this.fb.group({
      preptime: this.fb.control<number | null>(null),
      steps: this.fb.array<FormGroup<StepFormControls>>([]),
    }),
  });

  ngOnInit(): void {
    void this.loadInitialData();
    this.foodstuffBackendService.foodstuffsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refreshFoodstuffs());
  }

  ngAfterViewInit(): void {
    this.editorSections.changes
      .pipe(startWith(this.editorSections), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.connectSectionTracking());
  }

  goToSection(section: string): void {
    const target = this.editorSections.find((item) => item.nativeElement.id === section)?.nativeElement;
    if (target) this.scrollToEditorTarget(target, section);
  }

  private scrollToEditorTarget(target: HTMLElement, section: string): void {
    const nav = this.sectionNav?.nativeElement;
    const container = this.scrollContainer;
    if (!nav || !container) return;

    const top = container.scrollTop + target.getBoundingClientRect().top
      - container.getBoundingClientRect().top - nav.offsetHeight - 8;
    this.pendingNavigation = section;
    this.activeSection.set(section);
    container.scrollTo({ top, behavior: 'smooth' });
    this.scheduleNavigationSettled();
  }

  private connectSectionTracking(): void {
    if (this.editorSections.length === 0 || !this.sectionNav) return;
    const container = this.sectionNav.nativeElement.closest('mat-dialog-content');
    if (!(container instanceof HTMLElement)) return;

    this.removeScrollListener?.();
    this.removeTouchMoveListener?.();
    this.scrollContainer = container;
    this.removeTouchMoveListener = this.renderer.listen(container, 'touchmove', () => {
      this.pendingNavigation = null;
      clearTimeout(this.navigationSettledTimer);
    });
    this.removeScrollListener = this.renderer.listen(container, 'scroll', () => {
      if (this.pendingNavigation !== null) {
        this.scheduleNavigationSettled();
      } else {
        this.updateActiveSection();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.removeScrollListener?.();
      this.removeTouchMoveListener?.();
      clearTimeout(this.navigationSettledTimer);
    });
    this.updateActiveSection();
  }

  private scheduleNavigationSettled(): void {
    clearTimeout(this.navigationSettledTimer);
    this.navigationSettledTimer = setTimeout(() => {
      this.pendingNavigation = null;
    }, 160);
  }

  private updateActiveSection(): void {
    const nav = this.sectionNav?.nativeElement;
    const container = this.scrollContainer;
    if (!nav || !container) return;

    const baseThreshold = nav.getBoundingClientRect().bottom + 8;
    const visibleHeight = Math.max(0, container.getBoundingClientRect().bottom - baseThreshold);
    const remainingScroll = Math.max(0, container.scrollHeight - container.clientHeight - container.scrollTop);
    const bottomAdjustment = Math.max(0, visibleHeight - remainingScroll - 8);
    const threshold = baseThreshold + bottomAdjustment * Math.min(1, container.scrollTop / 80);
    let visible = 'basics';
    for (const item of this.editorSections) {
      const section = item.nativeElement;
      if (section.getBoundingClientRect().top <= threshold) {
        visible = section.id;
      }
    }
    this.activeSection.set(visible);
  }

  onSubmit(action: 'publish' | 'draft'): void {
    if (this.submitting()) return;
    if (this.recipeForm.invalid) {
      this.recipeForm.markAllAsTouched();
      const firstInvalidSection = this.sectionNavItems.find((item, index) => [
        this.recipeForm.controls.metaFormGroup,
        this.recipeForm.controls.ingredientsFormGroup,
        this.recipeForm.controls.preparationFormGroup,
      ][index].invalid);
      if (firstInvalidSection) {
        const section = this.editorSections?.find((item) => item.nativeElement.id === firstInvalidSection.id)?.nativeElement;
        if (section) {
          const invalidField = section.querySelector<HTMLElement>('input.ng-invalid, textarea.ng-invalid, mat-select.ng-invalid');
          this.scrollToEditorTarget(invalidField?.closest<HTMLElement>('mat-form-field') ?? section, firstInvalidSection.id);
        }
      }
      return;
    }
    const value = this.recipeForm.getRawValue();
    const { metaFormGroup, ingredientsFormGroup, preparationFormGroup } = value;

    if (
      metaFormGroup.name === null ||
      ingredientsFormGroup.servings === null ||
      ingredientsFormGroup.ingredients.some(
        (ingredient) =>
          ingredient.index === null ||
          ingredient.amount === null ||
          ingredient.foodstuffId === null
      ) ||
      preparationFormGroup.steps.some(
        (step) => step.description === null
      )
    ) {
      return;
    }

    this.submitted.emit({
      action,
      recipeVersion: {
        name: metaFormGroup.name,
        originName: metaFormGroup.originName || null,
        originUrl: metaFormGroup.originUrl || null,
        servings: ingredientsFormGroup.servings,
        ingredients: ingredientsFormGroup.ingredients.map((ingredient) => ({
          index: ingredient.index!,
          amount: ingredient.amount!,
          foodstuffId: ingredient.foodstuffId!,
        })),
        preptime: preparationFormGroup.preptime,
        steps: preparationFormGroup.steps.map((step, index) => ({
          index: index + 1,
          description: step.description!,
        })),
      },
    });
  }

  errorMessage(): string {
    const state = this.state();
    return state.status === 'error' && state.source === 'recipeVersion'
      ? 'Rezept konnte nicht geladen werden.'
      : 'Zutaten konnten nicht geladen werden.';
  }

  private async loadInitialData(): Promise<void> {
    this.state.set({ status: 'loading' });
    const recipeLineageId = this.recipeLineageId();

    if (recipeLineageId === null) {
      this.applyInitialResults(await this.loadFoodstuffs());
      return;
    }

    const [foodstuffResult, recipeVersionResult] = await Promise.all([
      this.loadFoodstuffs(),
      this.loadRecipeVersion(recipeLineageId, this.recipeVersionId()),
    ]);
    this.applyInitialResults(foodstuffResult, recipeVersionResult);
  }

  private async loadFoodstuffs(): Promise<LoadResult<FoodstuffOut[]>> {
    try {
      return {
        status: 'success',
        value: this.sortFoodstuffs(
          await this.foodstuffBackendService.getAllFoodstuffs()
        ),
      };
    } catch (error: unknown) {
      console.error('failed to fetch foodstuffs: ', error);
      return { status: 'error' };
    }
  }

  private async loadRecipeVersion(recipeLineageId: string, recipeVersionId: string | null): Promise<LoadResult<RecipeVersion>> {
    try {
      return {
        status: 'success',
        value: recipeVersionId === null
          ? await this.recipeBackendService.getActiveRecipeVersion(recipeLineageId)
          : await this.recipeBackendService.getRecipeVersion(recipeLineageId, recipeVersionId),
      };
    } catch (error: unknown) {
      console.error('failed to fetch recipe version: ', error);
      return { status: 'error' };
    }
  }

  private applyInitialResults(
    foodstuffResult: LoadResult<FoodstuffOut[]>,
    recipeVersionResult?: LoadResult<RecipeVersion>
  ): void {
    if (foodstuffResult.status === 'error') {
      this.state.set({ status: 'error', source: 'foodstuffs' });
      this.snackBarService.open('Zutaten konnten nicht geladen werden');
      return;
    }

    if (recipeVersionResult?.status === 'error') {
      this.state.set({ status: 'error', source: 'recipeVersion' });
      this.snackBarService.open('Rezept konnte nicht geladen werden');
      return;
    }

    this.foodstuffs.set(foodstuffResult.value);
    if (recipeVersionResult?.status === 'success') this.recipeVersion.set(recipeVersionResult.value);
    this.state.set({ status: 'ready' });
  }

  private async refreshFoodstuffs(): Promise<void> {
    try {
      this.foodstuffs.set(
        this.sortFoodstuffs(
          await this.foodstuffBackendService.getAllFoodstuffs()
        )
      );
    } catch (error: unknown) {
      console.error('failed to refresh foodstuffs: ', error);
      this.snackBarService.open('Zutaten konnten nicht aktualisiert werden');
    }
  }

  private sortFoodstuffs(foodstuffs: FoodstuffOut[]): FoodstuffOut[] {
    return [...foodstuffs].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }
}
