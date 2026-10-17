import { Component, computed, input, output } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { FoodstuffOut } from '../../../core/api/generated';

@Component({
  selector: 'app-foodstuffs-search',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './foodstuffs-search.component.html',
  styleUrl: './foodstuffs-search.component.scss',
})
export class FoodstuffsSearchComponent {
  readonly foodstuffs = input<FoodstuffOut[]>([]);
  readonly searchValue = input('');

  readonly searchValueChange = output<string>();

  names = computed((): string[] =>
    [...this.foodstuffs()]
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )
      .map((foodstuff) => foodstuff.name),
  );
  brands = computed((): string[] =>
    [...this.foodstuffs()]
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )
      .map((foodstuff) => foodstuff.brand || '')
      .filter((brand) => brand !== ''),
  );
  filteredNames = computed(
    (): Set<string> =>
      new Set(
        this.names().filter((name) =>
          name.toLowerCase().includes(this.searchValue().toLowerCase()),
        ),
      ),
  );
  filteredBrands = computed(
    (): Set<string> =>
      new Set(
        this.brands().filter((brand) =>
          brand.toLowerCase().includes(this.searchValue().toLowerCase()),
        ),
      ),
  );
}
