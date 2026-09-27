import { Component, inject } from '@angular/core';

import { RouterModule, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';
import { environment } from '../../../../environments/environment';
import { ActiveUserService } from '../../services/active-user.service';
import { PageHeaderService } from '../../services/page-header.service';
import { BackendMetaService } from '../../services/backend-meta.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-page-header',
  imports: [
    RouterModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule,
    MatMenuModule
],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  readonly pageHeaderService = inject(PageHeaderService);
  readonly activeUserService = inject(ActiveUserService);
  readonly backendMetaService = inject(BackendMetaService);
  readonly themeService = inject(ThemeService);

  readonly environmentName: string = environment.name;
}
