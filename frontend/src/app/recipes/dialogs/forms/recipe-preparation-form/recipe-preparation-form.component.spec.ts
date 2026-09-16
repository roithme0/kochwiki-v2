import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AbstractControl, FormArray, FormControl, FormGroup, FormGroupDirective, } from '@angular/forms';
import { RecipeVersion } from '../../../models/recipe';
import { RecipePreparationFormComponent } from './recipe-preparation-form.component';
import { CdkDragDrop } from '@angular/cdk/drag-drop';

describe('RecipePreparationFormComponent', () => {
    let fixture: ComponentFixture<RecipePreparationFormComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [RecipePreparationFormComponent],
            providers: [
                { provide: FormGroupDirective, useValue: { control: createRecipeForm() } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(RecipePreparationFormComponent);
    });

    it('loads steps by stored index without rendering an index field', () => {
        fixture.componentRef.setInput('recipeVersion', recipeVersionWithSteps());
        fixture.detectChanges();

        expect(descriptions()).toEqual(['Erst kochen', 'Dann servieren']);
        expect(fixture.nativeElement.querySelector('[formControlName="index"]')).toBeNull();
    });

    it('starts with one removable step when no steps exist', () => {
        fixture.detectChanges();

        expect(fixture.componentInstance.steps.length).toBe(1);

        fixture.componentInstance.removeStep(0);

        expect(fixture.componentInstance.steps.length).toBe(0);
    });

    it('reorders a dragged step without losing its control or validation state', () => {
        fixture.componentRef.setInput('recipeVersion', recipeVersionWithSteps());
        fixture.detectChanges();
        const firstStep = fixture.componentInstance.steps.at(0);
        firstStep.get('description')?.setValue('');

        fixture.componentInstance.dropStep({
            previousIndex: 0,
            currentIndex: 1,
        } as CdkDragDrop<AbstractControl[]>);
        fixture.detectChanges();

        expect(fixture.componentInstance.steps.at(1)).toBe(firstStep);
        expect(descriptions()).toEqual(['Dann servieren', '']);
        expect(firstStep.invalid).toBe(true);
    });

    it('renders step-specific accessible drag handles', () => {
        fixture.componentRef.setInput('recipeVersion', recipeVersionWithSteps());
        fixture.detectChanges();
        const buttons = fixture.nativeElement.querySelectorAll('.drag-handle') as NodeListOf<HTMLButtonElement>;

        expect(buttons.length).toBe(2);
        expect(buttons[0].getAttribute('aria-label')).toBe('Schritt 1 ziehen, um ihn zu verschieben');
        expect(buttons[1].getAttribute('aria-label')).toBe('Schritt 2 ziehen, um ihn zu verschieben');
    });

    it('prevents adding a 100th step and allows adding after removal', () => {
        fixture.detectChanges();
        for (let index = 0; index < 99; index += 1) {
            fixture.componentInstance.addStep();
        }
        fixture.detectChanges();

        expect(fixture.componentInstance.steps.length).toBe(99);
        fixture.componentInstance.addStep();
        expect(fixture.componentInstance.steps.length).toBe(99);
        fixture.componentInstance.removeStep(0);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('#step-limit')).toBeNull();
    });

    function descriptions(): string[] {
        return fixture.componentInstance.steps.controls.map((step) => {
            const value: unknown = step.get('description')?.value;
            return typeof value === 'string' ? value : '';
        });
    }
});

function createRecipeForm(): FormGroup {
    return new FormGroup({
        preparationFormGroup: new FormGroup({
            preptime: new FormControl<number | null>(null),
            steps: new FormArray([]),
        }),
    });
}

function recipeVersionWithSteps(): RecipeVersion {
    return {
        recipeLineageId: '00000000-0000-4000-8000-000000000001',
        recipeVersionId: '00000000-0000-0000-0000-000000000001',
        state: 'active',
        createdAt: '2026-09-12T10:00:00Z',
        lastModified: '2026-09-12T10:00:00Z',
        name: 'Testrezept',
        servings: 2,
        preptime: 20,
        originName: null,
        originUrl: null,
        kcal: null,
        carbs: null,
        protein: null,
        fat: null,
        ingredients: [],
        steps: [
            { id: 2, index: 4, description: 'Dann servieren', recipeVersionId: '00000000-0000-0000-0000-000000000001' },
            { id: 1, index: 2, description: 'Erst kochen', recipeVersionId: '00000000-0000-0000-0000-000000000001' },
        ],
    };
}
