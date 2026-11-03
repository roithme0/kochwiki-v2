import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatCardModule } from '@angular/material/card';

@Component({
  imports: [MatCardModule],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Plain title</mat-card-title>
      </mat-card-header>
    </mat-card>
    <mat-card>
      <mat-card-header>
        <mat-card-title><h2>Recipe heading</h2></mat-card-title>
      </mat-card-header>
    </mat-card>
    <mat-card>
      <mat-card-header>
        <mat-card-title><h3>Foodstuff heading</h3></mat-card-title>
      </mat-card-header>
    </mat-card>
  `,
})
class CardTypographyHost {}

describe('Shared card headline typography', () => {
  it('uses recipe headline typography for every card without local styles', () => {
    const fixture = TestBed.createComponent(CardTypographyHost);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const titles = host.querySelectorAll<HTMLElement>('mat-card-title');
    expect(titles).toHaveLength(3);
    const reference = getComputedStyle(titles[0]);
    expect(reference.fontSize).toBe('18px');
    expect(reference.lineHeight).toBe('18px');

    for (const element of host.querySelectorAll<HTMLElement>(
      'mat-card-title, mat-card-title h2, mat-card-title h3',
    )) {
      const style = getComputedStyle(element);
      expect(style.fontSize).toBe(reference.fontSize);
      expect(style.lineHeight).toBe(reference.lineHeight);
      expect(style.fontWeight).toBe(reference.fontWeight);
      expect(style.fontFamily).toBe(reference.fontFamily);
      expect(style.color).toBe(reference.color);
      expect(element.getBoundingClientRect().height).toBeGreaterThan(0);
    }
    fixture.destroy();
  });
});
