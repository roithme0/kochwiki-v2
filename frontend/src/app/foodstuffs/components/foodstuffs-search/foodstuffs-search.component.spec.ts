import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoodstuffsSearchComponent } from './foodstuffs-search.component';

@Component({
  imports: [FoodstuffsSearchComponent],
  template: `
    <app-foodstuffs-search
      [searchValue]="query()"
      (searchValueChange)="query.set($event)"
    />
    <app-foodstuffs-search
      [searchValue]="otherQuery()"
      (searchValueChange)="otherQuery.set($event)"
    />
  `,
})
class SearchHostComponent {
  readonly query = signal('');
  readonly otherQuery = signal('Reis');
}

describe('FoodstuffsSearchComponent', () => {
  it('supports caller-owned queries, typing and clearing without sharing state between instances', async () => {
    const fixture = TestBed.createComponent(SearchHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement as HTMLElement;
    const inputs = element.querySelectorAll<HTMLInputElement>('input');
    const input = inputs[0];

    expect(inputs[1].value).toBe('Reis');
    input.value = 'PA';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.query()).toBe('PA');
    expect(inputs[1].value).toBe('Reis');

    const clear = element.querySelector<HTMLButtonElement>(
      'button[aria-label="Suche zurücksetzen"]',
    );
    expect(clear).not.toBeNull();
    clear?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.query()).toBe('');
    expect(input.value).toBe('');
    expect(fixture.componentInstance.otherQuery()).toBe('Reis');

    fixture.componentInstance.query.set('externally supplied');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('externally supplied');
  });
});
