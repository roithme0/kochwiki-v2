import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChatUiComponent, artifactRenderer, type ChatArtifact } from '@roithme0/chat-ui/ui';
import { AgentConfiguration, ConversationController, HttpConversationTransport } from '@roithme0/chat-ui/conversation';

@Component({
    imports: [ChatUiComponent],
    template: `
    <ng-template #hostRenderer let-payload let-artifact="artifact">
      <p class="host-renderer">{{ artifact.id }}: {{ payload.name }} / {{ payload.description }}</p>
    </ng-template>
    <ai-chat-ui bannerTitle="Banner" bannerDescription="Description"
      [content]="artifact ? [artifact] : []"
      [artifactRenderers]="showRenderer ? { 'host-content': artifactRenderer(hostRenderer) } : {}" />
  `,
})
class RendererTestHost {
    readonly artifactRenderer = artifactRenderer;
    artifact: ChatArtifact<{ name: string; description: string }> | undefined = {
        kind: 'artifact',
        type: 'host-content',
        id: 'host-owned-id',
        headline: 'Host headline',
        payload: { name: 'Host name', description: 'Host description' },
    };
    showRenderer = true;
}

describe('Packaged chat UI integration', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [RendererTestHost] });
    });

    it('invokes the host renderer inside the library with the exact artifact payload', () => {
        const fixture = TestBed.createComponent(RendererTestHost);
        fixture.detectChanges();

        const library = fixture.debugElement.query(By.directive(ChatUiComponent));
        const element: HTMLElement = library.nativeElement;
        expect(element.querySelector('.host-renderer')?.textContent?.trim())
            .toBe('host-owned-id: Host name / Host description');
        expect(element.querySelector('.artifact h3')?.textContent?.trim()).toBe('Host headline');
    });

    it('keeps the banner and headline with an unsupported presentation message when no renderer is supplied', () => {
        const fixture = TestBed.createComponent(RendererTestHost);
        fixture.componentInstance.showRenderer = false;
        fixture.detectChanges();

        const element: HTMLElement = fixture.nativeElement;
        expect(element.querySelector('.banner h2')?.textContent?.trim()).toBe('Banner');
        expect(fixture.debugElement.query(By.css('.artifact h3'))).not.toBeNull();
        expect(element.querySelector('pre')).toBeNull();
        expect(element.textContent).toContain('Diese Darstellung wird nicht unterst\u00fctzt.');
        expect(element.textContent).not.toContain('Host name');
        expect(fixture.debugElement.query(By.css('.host-renderer'))).toBeNull();
        expect(element.textContent).not.toContain('host-owned-id');
    });

    it('shows only the banner when no artifact is supplied', () => {
        const fixture = TestBed.createComponent(RendererTestHost);
        fixture.componentInstance.artifact = undefined;
        fixture.detectChanges();

        expect(fixture.debugElement.query(By.css('.banner'))).not.toBeNull();
        expect(fixture.debugElement.query(By.css('.artifact'))).toBeNull();
    });
});

describe('Packaged conversation entry point', () => {
    it('exposes a controller compatible with the Kochwiki HTTP transport', () => {
        const transport = new HttpConversationTransport('/ai/api/v1', AgentConfiguration.kochwiki, 'kochwiki:1');
        const controller = new ConversationController(transport, () => {});

        expect(controller).toBeInstanceOf(ConversationController);
    });
});
