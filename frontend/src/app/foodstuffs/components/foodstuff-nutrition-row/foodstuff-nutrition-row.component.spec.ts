import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import { FoodstuffNutritionRowComponent } from './foodstuff-nutrition-row.component';

describe('FoodstuffNutritionRowComponent', () => {
  let fixture: ComponentFixture<FoodstuffNutritionRowComponent>;
  let control: FormControl<number | null>;
  let host: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(FoodstuffNutritionRowComponent);
    control = new FormControl<number | null>(8.5);
    fixture.componentRef.setInput('label', 'Ballaststoffe');
    fixture.componentRef.setInput('control', control);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  function input(): HTMLInputElement {
    const element = host.querySelector('input');
    if (!element) throw new Error('Expected nutrition input');
    return element;
  }

  it.each([
    ['', null],
    ['0', 0],
    ['4.25', 4.25],
  ] as const)(
    'maps entered %s to %s on the parent control',
    (entered, expected) => {
      expect(input().value).toBe('8.5');
      input().value = entered;
      input().dispatchEvent(new Event('input'));
      input().dispatchEvent(new Event('blur'));
      expect(control.value).toBe(expected);
      expect(control.dirty).toBe(true);
      expect(control.touched).toBe(true);
    },
  );

  it('reflects parent value, validation and disabled state', () => {
    control.setValidators(Validators.min(0));
    control.setValue(-1);
    fixture.detectChanges();
    expect(input().value).toBe('-1');
    expect(control.hasError('min')).toBe(true);
    control.disable();
    fixture.detectChanges();
    expect(input().disabled).toBe(true);
    control.enable();
    control.setValue(0);
    fixture.detectChanges();
    expect(input().disabled).toBe(false);
    expect(input().value).toBe('0');
    expect(control.valid).toBe(true);
  });

  it('labels the numeric field and renders a marker only when a color is supplied', () => {
    expect(input().getAttribute('aria-label')).toBe('Ballaststoffe');
    expect(host.querySelector('.color-indicator')).toBeNull();
    expect(host.querySelector('.nutrient-input')?.textContent?.trim()).toBe(
      'g',
    );
    fixture.componentRef.setInput('color', 'rgb(105, 153, 174)');
    fixture.componentRef.setInput('label', 'Kohlenhydrate');
    fixture.detectChanges();
    expect(input().getAttribute('aria-label')).toBe('Kohlenhydrate');
    expect(
      host.querySelector<HTMLElement>('.color-indicator')?.style
        .backgroundColor,
    ).toBe('rgb(105, 153, 174)');
  });
});
