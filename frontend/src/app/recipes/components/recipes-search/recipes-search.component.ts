import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';


@Component({
  selector: 'app-recipes-search',
  imports: [
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatButtonModule
],
  templateUrl: './recipes-search.component.html',
  styleUrl: './recipes-search.component.scss',
})
export class RecipesSearchComponent {
  readonly searchValue = input('');

  readonly searchValueChange = output<string>();
}
