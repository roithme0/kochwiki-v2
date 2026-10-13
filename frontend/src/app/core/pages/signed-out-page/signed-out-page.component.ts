import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AuthNavigationService } from '../../services/auth-navigation.service';

@Component({
  selector: 'app-signed-out-page',
  imports: [MatButtonModule],
  templateUrl: './signed-out-page.component.html',
  styleUrl: './signed-out-page.component.scss',
})
export class SignedOutPageComponent {
  readonly navigation = inject(AuthNavigationService);
}
