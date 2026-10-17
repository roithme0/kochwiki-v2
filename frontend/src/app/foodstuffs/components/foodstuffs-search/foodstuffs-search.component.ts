import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-foodstuffs-search',
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './foodstuffs-search.component.html',
  styleUrl: './foodstuffs-search.component.scss',
})
export class FoodstuffsSearchComponent {
  readonly searchValue = input('');

  readonly searchValueChange = output<string>();
}
