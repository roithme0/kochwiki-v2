import { TestBed } from '@angular/core/testing';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffDisplayComponent } from './foodstuff-display.component';

describe('FoodstuffDisplayComponent layout', () => {
  it('places details beside the name and centers it when there is no brand', async () => {
    TestBed.configureTestingModule({
      imports: [FoodstuffDisplayComponent],
      providers: [{ provide: FoodstuffImageService, useValue: {} }],
    });
    const fixture = TestBed.createComponent(FoodstuffDisplayComponent);
    fixture.componentRef.setInput('showBrand', true);
    fixture.componentRef.setInput('foodstuff', {
      name: 'Pepper',
      details: 'green',
      brand: 'Brand',
      imageId: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const label = host.querySelector<HTMLElement>('.foodstuff-label');
    const name = host.querySelector<HTMLElement>('.foodstuff-name');
    const details = host.querySelector<HTMLElement>('.foodstuff-details');
    const brand = host.querySelector<HTMLElement>('.foodstuff-brand');
    if (!label || !name || !details || !brand)
      throw new Error('Expected label');
    const height = label.getBoundingClientRect().height;
    expect(details.getBoundingClientRect().left).toBeGreaterThan(
      name.getBoundingClientRect().right,
    );
    expect(details.getBoundingClientRect().top).toBeLessThan(
      name.getBoundingClientRect().bottom,
    );
    expect(brand.getBoundingClientRect().top).toBeGreaterThan(
      name.getBoundingClientRect().top,
    );
    expect(getComputedStyle(details).color).toBe(getComputedStyle(brand).color);
    expect(getComputedStyle(details).fontSize).toBe(
      getComputedStyle(brand).fontSize,
    );

    fixture.componentRef.setInput('foodstuff', {
      name: 'Pepper',
      details: 'green',
      imageId: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const labelRect = label.getBoundingClientRect();
    const nameRect = name.parentElement!.getBoundingClientRect();
    expect(labelRect.height).toBeCloseTo(height, 0);
    expect((nameRect.top + nameRect.bottom) / 2).toBeCloseTo(
      (labelRect.top + labelRect.bottom) / 2,
      0,
    );
    fixture.destroy();
  });
});
