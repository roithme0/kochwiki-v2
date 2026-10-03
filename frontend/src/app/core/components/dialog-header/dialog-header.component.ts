import { Component, input } from '@angular/core';

import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dialog-header',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './dialog-header.component.html',
  styleUrl: './dialog-header.component.scss',
})
export class DialogHeaderComponent {
  title = input.required<string>();
  showCloseButon = input.required<boolean>();
}
