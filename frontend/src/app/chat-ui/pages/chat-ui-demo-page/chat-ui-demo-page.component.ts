import { Component, OnInit, inject } from '@angular/core';
import { ChatDemoRendererDirective, ChatUiComponent, IntegrationDemoArtifact } from '@roithme0/chat-ui';
import { PageHeaderService } from '../../../core/services/page-header.service';

@Component({
  selector: 'app-chat-ui-demo-page',
  imports: [ChatUiComponent, ChatDemoRendererDirective],
  templateUrl: './chat-ui-demo-page.component.html',
  styleUrl: './chat-ui-demo-page.component.scss',
})
export class ChatUiDemoPageComponent implements OnInit {
  private readonly pageHeaderService = inject(PageHeaderService);

  readonly demoArtifact: IntegrationDemoArtifact = {
    type: 'integration-demo',
    id: 'kochwiki-chat-ui-demo',
    headline: 'Statisches Demo-Artefakt',
    payload: {
      name: 'Bunte Gemüsepfanne',
      description: 'Ein einfaches Demo-Rezept mit Gemüse und Kräutern. Diese Inhalte stammen aus Kochwiki und wurden nicht von einer KI erzeugt.',
    },
  };

  ngOnInit(): void {
    this.pageHeaderService.updateHeader(true, 'Chat-UI Demo', '', false);
  }
}
