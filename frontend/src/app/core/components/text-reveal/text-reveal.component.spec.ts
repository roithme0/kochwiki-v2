import { TestBed } from '@angular/core/testing';
import { TextRevealComponent } from './text-reveal.component';

describe('TextRevealComponent', () => {
  it('reserves the complete text, preserves line breaks, and exposes it once to screen readers', () => {
    const fixture = TestBed.createComponent(TextRevealComponent);
    const text = 'Schön,\n👩‍🍳 cafe\u0301';
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement as HTMLElement;
    const visual = element.querySelector('[aria-hidden="true"]');

    expect(element.querySelector('.accessible-text')?.textContent).toBe(text);
    expect(visual?.textContent).toBe(text);
    expect(
      Array.from(
        element.querySelectorAll('.character'),
        (character) => character.textContent,
      ),
    ).toContain('👩‍🍳');
    expect(fixture.componentInstance.characters().at(-1)?.value).toBe(
      'e\u0301',
    );
  });

  it('restarts the reveal when text changes and applies the configured start and character delays', () => {
    const fixture = TestBed.createComponent(TextRevealComponent);
    fixture.componentRef.setInput('text', 'ABC');
    fixture.componentRef.setInput('characterDelay', 75);
    fixture.componentRef.setInput('startDelay', 500);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement as HTMLElement;
    const previous = element.querySelector('.character');
    expect(
      element.querySelectorAll<HTMLElement>('.character')[0].style
        .animationDelay,
    ).toBe('500ms');
    expect(
      element.querySelectorAll<HTMLElement>('.character')[2].style
        .animationDelay,
    ).toBe('650ms');

    fixture.componentRef.setInput('text', 'XYZ');
    fixture.detectChanges();
    expect(element.querySelector('.character')).not.toBe(previous);
    expect(element.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      'XYZ',
    );
  });
});
