import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoodstuffUnit } from '../../models/foodstuff-unit';
import { FoodstuffFormComponent } from './foodstuff-form.component';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';

describe('FoodstuffFormComponent', () => {
    let component: FoodstuffFormComponent;
    let fixture: ComponentFixture<FoodstuffFormComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FoodstuffFormComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(FoodstuffFormComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('submitLabel', 'Speichern');
    });

    it('renders local labels and emits the typed foodstuff updates', () => {
        const submitted = vi.fn().mockName('submitted');
        component.submitted.subscribe(submitted);

        fixture.detectChanges();
        component.form.setValue({
            name: 'Linsen', brand: null, unit: FoodstuffUnit.Gram, kcal: 100, carbs: 12, protein: 8, fat: 1,
        });
        component.onSubmit();

        const labels: NodeListOf<Element> = fixture.nativeElement.querySelectorAll('mat-label');
        expect(Array.from(labels, label => label.textContent?.trim())).toEqual(
            ['Name', 'Einheit', 'Marke', 'Kalorien', 'Kohlenhydrate', 'Proteine', 'Fett']
        );
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

    it('offers local labels and submits the matching unit wire values', async () => {
        fixture.detectChanges();
        component.form.controls.name.setValue('Oats');
        const submitted = vi.fn();
        component.submitted.subscribe(submitted);
        const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
        await select.open();
        const options = await select.getOptions();
        expect(await Promise.all(options.map(option => option.getText()))).toEqual(
            ['Gramm', 'Milliliter', 'Stück']
        );
        await select.close();
        for (const [label, unit] of [
            ['Gramm', 'G'], ['Milliliter', 'ML'], ['Stück', 'PIECE'],
        ]) {
            await select.clickOptions({ text: label });
            component.onSubmit();
            expect(submitted).toHaveBeenLastCalledWith(expect.objectContaining({ unit }));
        }
    });
});
