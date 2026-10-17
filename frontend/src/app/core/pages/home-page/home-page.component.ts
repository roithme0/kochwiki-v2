import type { OnInit } from '@angular/core';
import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { RouterLink } from '@angular/router';
import { PageHeaderService } from '../../services/page-header.service';
import { VERSION } from '../../../../version';
import { BackendMetaService } from '../../services/backend-meta.service';
import { TextRevealComponent } from '../../components/text-reveal/text-reveal.component';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, TextRevealComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent implements OnInit {
  private readonly document = inject(DOCUMENT);
  readonly pageHeaderService = inject(PageHeaderService);
  readonly backendMetaService = inject(BackendMetaService);

  readonly frontendVersion: string = VERSION;
  readonly animateGreeting = this.claimGreetingReveal();

  private claimGreetingReveal(): boolean {
    if (this.document.defaultView === null) return false;
    try {
      const storage = this.document.defaultView.sessionStorage;
      const key = 'kochwiki.home-greeting-revealed';
      if (storage.getItem(key) === 'true') return false;
      storage.setItem(key, 'true');
      return true;
    } catch {
      return true;
    }
  }

  ngOnInit(): void {
    this.pageHeaderService.updateHeader(true, 'Kochwiki', '', false);
  }
}
