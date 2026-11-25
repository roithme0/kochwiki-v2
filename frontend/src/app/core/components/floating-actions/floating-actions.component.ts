import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface FloatingAction {
  id: string;
  label: string;
  icon: string;
  color?: 'primary' | 'warn';
  route?: string[];
}

@Component({
  selector: 'app-floating-actions',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './floating-actions.component.html',
  styleUrl: './floating-actions.component.scss',
})
export class FloatingActionsComponent {
  readonly actions = input.required<readonly FloatingAction[]>();
  readonly activated = output<string>();
}
