import { Component, inject } from '@angular/core';

import { RouterOutlet } from '@angular/router';
import { PageHeaderComponent } from './core/components/page-header/page-header.component';
import { ActiveUserService } from './core/services/active-user.service';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PageHeaderComponent, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly activeUserService = inject(ActiveUserService);
}
