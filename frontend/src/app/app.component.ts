import { Component, inject } from '@angular/core';

import { RouterOutlet } from '@angular/router';
import { PageHeaderComponent } from './core/components/page-header/page-header.component';
import { ActiveUserService } from './core/services/active-user.service';
import { AuthNavigationService } from './core/services/auth-navigation.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PageHeaderComponent, MatProgressSpinnerModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly activeUserService = inject(ActiveUserService);
  readonly authNavigation = inject(AuthNavigationService);
}
