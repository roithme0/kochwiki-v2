import { TestBed } from '@angular/core/testing';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffDisplayComponent } from './foodstuff-display.component';

describe('FoodstuffDisplayComponent', () => {
  it.each([false, true])(
    'renders literal details, optional brand (%s), and removes the details line when empty',
    (showBrand) => {
      const download = vi.fn();
      TestBed.configureTestingModule({
        imports: [FoodstuffDisplayComponent],
        providers: [
          {
            provide: FoodstuffImageService,
            useValue: { contentUrl: download },
          },
        ],
      });
      const fixture = TestBed.createComponent(FoodstuffDisplayComponent);
      fixture.componentRef.setInput('showBrand', showBrand);
      fixture.componentRef.setInput('foodstuff', {
        name: 'Pfefferonen',
        details: '<b>grün, scharf</b>',
        brand: 'Marke',
        imageId: null,
      });
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.foodstuff-name')?.textContent).toBe(
        'Pfefferonen',
      );
      expect(host.querySelector('.foodstuff-details')?.textContent).toBe(
        '<b>grün, scharf</b>',
      );
      expect(host.querySelector('b')).toBeNull();
      expect(host.querySelector('.foodstuff-brand')?.textContent ?? null).toBe(
        showBrand ? 'Marke' : null,
      );
      expect(host.querySelector('img')?.getAttribute('src')).toBe(
        'images/question-mark.png',
      );
      expect(host.querySelector('img')?.alt).toBe('');
      expect(download).not.toHaveBeenCalled();

      fixture.componentRef.setInput('foodstuff', {
        name: 'Salz',
        details: null,
        imageId: null,
      });
      fixture.detectChanges();
      expect(host.textContent?.trim()).toBe('Salz');
      expect(host.querySelector('.foodstuff-details')).toBeNull();
      expect(host.querySelector('.foodstuff-brand')).toBeNull();
    },
  );
});
