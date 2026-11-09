import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { foodstuffOut } from '../../../testing/foodstuff.fixtures';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import {
  FoodstuffListStatusDirective,
  FoodstuffsListComponent,
} from './foodstuffs-list.component';

@Component({
  imports: [FoodstuffsListComponent, FoodstuffListStatusDirective],
  template: `<app-foodstuffs-list
    [foodstuffs]="items"
    [searchValue]="query()"
    [disabledIds]="disabled"
    [pressedIds]="pressed"
    (activated)="activated.push($event.id)"
    (resetSearch)="query.set('')"
  >
    <ng-template foodstuffListStatus let-item>{{ item.id }}</ng-template>
  </app-foodstuffs-list>`,
})
class HostComponent {
  items = [
    foodstuffOut({
      id: 1,
      name: 'Zucchini',
      details: 'Grün',
      brand: 'Farm',
      imageId: 'image',
    }),
    foodstuffOut({ id: 2, name: 'Apfel', brand: 'Obst' }),
    foodstuffOut({ id: 3, name: 'apfel', details: 'Rot' }),
  ];
  query = signal('');
  disabled = new Set([2]);
  pressed: ReadonlySet<number> | undefined = new Set([1]);
  activated: number[] = [];
}

describe('FoodstuffsListComponent', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FoodstuffImageService,
          useValue: { contentUrl: () => '/storage/image' },
        },
      ],
    }),
  );

  it('sorts stably without mutating records and filters name, details and brand case insensitively', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const names = (): string[] =>
      Array.from(
        host.querySelectorAll('.foodstuff-name'),
        (e) => e.textContent?.trim() ?? '',
      );
    expect(names()).toEqual(['Apfel', 'apfel', 'Zucchini']);
    expect(fixture.componentInstance.items.map((item) => item.id)).toEqual([
      1, 2, 3,
    ]);
    for (const query of ['ZUC', 'GRÜN', 'fARm']) {
      fixture.componentInstance.query.set(query);
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      expect(names()).toEqual(['Zucchini']);
    }
    fixture.componentInstance.query.set('missing');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(names()).toEqual([]);
    host.querySelector<HTMLButtonElement>('.empty-state button')?.click();
    fixture.detectChanges();
    expect(names()).toEqual(['Apfel', 'apfel', 'Zucchini']);
    expect(host.querySelector('img[src="/storage/image"]')).not.toBeNull();
  });

  it('emits enabled records, blocks disabled records, and renders pressed state and status context', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button[mat-list-item]'),
    );
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[0].textContent).toContain('2');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    buttons[0].click();
    buttons[2].click();
    expect(fixture.componentInstance.activated).toEqual([1]);
    fixture.componentInstance.pressed = undefined;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(buttons[2].hasAttribute('aria-pressed')).toBe(false);
    expect(
      host.querySelector('mat-action-list')?.getAttribute('aria-label'),
    ).toBeTruthy();
  });
});
