import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FoodstuffMetadataService } from '../../services/foodstuff-metadata.service';
import { FoodstuffUnit } from '../../models/foodstuff-unit';
import { FoodstuffFormComponent } from './foodstuff-form.component';

describe('FoodstuffFormComponent', () => {
    let component: FoodstuffFormComponent;
    let fixture: ComponentFixture<FoodstuffFormComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FoodstuffFormComponent],
            providers: [
                {
                    provide: FoodstuffMetadataService,
                    useValue: {
                        verboseNames: signal({
                            name: 'Name', brand: 'Marke', unit: 'Einheit', kcal: 'Kalorien',
                            carbs: 'Kohlenhydrate', protein: 'Protein', fat: 'Fett',
                        }),
                        unitChoices: signal({ [FoodstuffUnit.Gram]: 'Gramm' }),
                    },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(FoodstuffFormComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('submitLabel', 'Speichern');
    });

    it('uses metadata and emits the typed foodstuff updates', () => {
        const submitted = vi.fn().mockName('submitted');
        component.submitted.subscribe(submitted);

        fixture.detectChanges();
        component.form.setValue({
            name: 'Linsen', brand: null, unit: FoodstuffUnit.Gram, kcal: 100, carbs: 12, protein: 8, fat: 1,
        });
        component.onSubmit();

        expect(component.verboseNames()?.name).toBe('Name');
        expect(component.unitChoices()).toEqual({ [FoodstuffUnit.Gram]: 'Gramm' });
        expect(submitted).toHaveBeenCalledTimes(1);
        expect(submitted).toHaveBeenCalledWith({
            name: 'Linsen', brand: null, unit: FoodstuffUnit.Gram, kcal: 100, carbs: 12, protein: 8, fat: 1,
        });
    });

    it('patches the form when an existing foodstuff is supplied', () => {
        fixture.componentRef.setInput('foodstuff', {
            name: 'Bohnen', brand: 'Bio', unit: FoodstuffUnit.Gram, kcal: 110, carbs: 15, protein: 7, fat: 1,
        });
        fixture.detectChanges();

        expect(component.form.getRawValue()).toEqual({
            name: 'Bohnen', brand: 'Bio', unit: FoodstuffUnit.Gram, kcal: 110, carbs: 15, protein: 7, fat: 1,
        });
    });
});
