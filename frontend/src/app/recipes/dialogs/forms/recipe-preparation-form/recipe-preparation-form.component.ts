import type { StepOut, RecipeVersionOut } from '../../../../core/api/generated';
import { Component, NgZone, ViewChild, inject, input } from '@angular/core';

import {
  FormArray,
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormGroupDirective,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { take } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-recipe-preparation-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    DragDropModule
],
  templateUrl: './recipe-preparation-form.component.html',
  styleUrl: './recipe-preparation-form.component.scss',
})
export class RecipePreparationFormComponent {
  recipeVersion = input<RecipeVersionOut>();

  readonly recipeFormDirective = inject(FormGroupDirective);
  readonly fb = inject(FormBuilder);
  readonly ngZone = inject(NgZone);

  recipeForm!: FormGroup;
  preparationFormGroup!: FormGroup;

  @ViewChild('autosize') readonly autosize!: CdkTextareaAutosize;

  ngOnInit() {
    this.recipeForm = this.recipeFormDirective.control;
    this.preparationFormGroup = this.recipeForm.get(
      'preparationFormGroup'
    ) as FormGroup;

    const recipeVersion: RecipeVersionOut | undefined = this.recipeVersion();
    if (recipeVersion !== undefined) {
      this.recipeForm.get('preparationFormGroup')?.patchValue({
        preptime: recipeVersion.preptime,
      });
      [...recipeVersion.steps]
        .sort((a, b) => a.index - b.index)
        .forEach((step) => this.addStep(step));
    }
    if (this.steps.length === 0) this.addStep();
  }

  get steps(): FormArray {
    return this.recipeForm.get('preparationFormGroup.steps') as FormArray;
  }

  addStep(step?: StepOut): void {
    if (this.steps.length >= 99) return;

    this.steps.push(
      this.fb.group({
        description: [step?.description ?? '', Validators.required],
      })
    );
  }

  removeStep(index: number): void {
    this.steps.removeAt(index);
  }

  dropStep(event: CdkDragDrop<AbstractControl[]>): void {
    const previousIndex = event.previousIndex;
    const currentIndex = event.currentIndex;
    if (
      previousIndex === currentIndex ||
      previousIndex < 0 ||
      currentIndex < 0 ||
      previousIndex >= this.steps.length ||
      currentIndex >= this.steps.length
    ) {
      return;
    }

    const step = this.steps.at(previousIndex);
    this.steps.removeAt(previousIndex);
    this.steps.insert(currentIndex, step);
  }

  triggerTextareaResize() {
    this.ngZone.onStable
      .pipe(take(1))
      .subscribe(() => this.autosize.resizeToFitContent(true));
  }
}
