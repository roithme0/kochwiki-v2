import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ContentChild,
  Directive,
  ElementRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffDisplayComponent } from '../foodstuff-display/foodstuff-display.component';

export interface FoodstuffListStatusContext {
  $implicit: FoodstuffOut;
}

@Directive({ selector: 'ng-template[foodstuffListStatus]' })
export class FoodstuffListStatusDirective {
  readonly template =
    inject<TemplateRef<FoodstuffListStatusContext>>(TemplateRef);
  static ngTemplateContextGuard(
    _directive: FoodstuffListStatusDirective,
    context: unknown,
  ): context is FoodstuffListStatusContext {
    void _directive;
    void context;
    return true;
  }
}

@Component({
  selector: 'app-foodstuffs-list',
  imports: [
    MatListModule,
    MatButtonModule,
    FoodstuffDisplayComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './foodstuffs-list.component.html',
  styleUrl: './foodstuffs-list.component.scss',
})
export class FoodstuffsListComponent {
  readonly foodstuffs = input<FoodstuffOut[]>([]);
  readonly searchValue = input('');
  readonly disabledIds = input<ReadonlySet<number>>(new Set());
  readonly pressedIds = input<ReadonlySet<number> | undefined>();
  readonly showResetWhenEmpty = input(true);
  readonly emptyMessage = input('Keine Lebensmittel gefunden.');
  readonly emptyCatalogueMessage = input('Keine Lebensmittel gefunden.');

  readonly activated = output<FoodstuffOut>();
  readonly resetSearch = output<void>();

  @ContentChild(FoodstuffListStatusDirective)
  status?: FoodstuffListStatusDirective;

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly displayedFoodstuffs = computed(() => {
    const query = this.searchValue().toLowerCase();
    return this.foodstuffs()
      .filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          (item.details?.toLowerCase().includes(query) ?? false) ||
          (item.brand?.toLowerCase().includes(query) ?? false),
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
  });

  constructor() {
    effect(() => {
      this.searchValue();
      this.element.nativeElement.scrollTop = 0;
    });
  }
}
