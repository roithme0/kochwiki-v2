import type { RecipeVersionOut } from '../../../../core/api/generated';
import { Component, inject, input } from '@angular/core';

import {
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-recipe-meta-form',
  imports: [
    ReactiveFormsModule,
    MatInputModule,
    MatFormFieldModule
],
  templateUrl: './recipe-meta-form.component.html',
  styleUrl: './recipe-meta-form.component.scss',
})
export class RecipeMetaFormComponent {
  recipeVersion = input<RecipeVersionOut>();

  recipeForm!: FormGroup;
  metaFormGroup!: FormGroup;

  readonly recipeFormDirective = inject(FormGroupDirective);

  ngOnInit() {
    this.recipeForm = this.recipeFormDirective.control;
    this.metaFormGroup = this.recipeForm.get('metaFormGroup') as FormGroup;

    const recipeVersion: RecipeVersionOut | undefined = this.recipeVersion();
    if (recipeVersion !== undefined) {
      this.recipeForm.get('metaFormGroup')?.setValue({
        name: recipeVersion.name,
      });
    }
  }
}
