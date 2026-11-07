import { TestBed } from '@angular/core/testing';
import { DisplayImageComponent } from './display-image.component';

describe('DisplayImageComponent layout', () => {
  it('contains images in a constrained square without stretching or cropping', async () => {
    TestBed.configureTestingModule({ imports: [DisplayImageComponent] });
    const fixture = TestBed.createComponent(DisplayImageComponent);
    fixture.componentRef.setInput('src', null);
    fixture.componentRef.setInput(
      'placeholder',
      'images/recipe-image-placeholder.png',
    );
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '40px';
    host.style.height = '40px';
    fixture.detectChanges();
    await fixture.whenStable();
    const image = host.querySelector('img')!;
    const bounds = image.getBoundingClientRect();
    expect(bounds.width).toBe(40);
    expect(bounds.height).toBe(40);
    expect(getComputedStyle(image).objectFit).toBe('contain');
    fixture.destroy();
  });
});
