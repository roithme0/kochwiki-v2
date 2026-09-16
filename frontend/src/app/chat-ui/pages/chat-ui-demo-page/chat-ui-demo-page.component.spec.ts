import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChatDemoRendererDirective, ChatUiComponent, IntegrationDemoArtifact } from '@roithme0/chat-ui';
import { ChatUiDemoPageComponent } from './chat-ui-demo-page.component';
import { PageHeaderService } from '../../../core/services/page-header.service';

@Component({
    imports: [ChatUiComponent, ChatDemoRendererDirective],
    template: `
    <ng-template aiChatDemoRenderer #demoRenderer="aiChatDemoRenderer" let-artifact>
      <p class="host-renderer">{{ artifact.id }}: {{ artifact.payload.name }} / {{ artifact.payload.description }}</p>
    </ng-template>
    <ai-chat-ui bannerTitle="Banner" bannerDescription="Description"
      [artifact]="artifact" [renderer]="showRenderer ? demoRenderer.template : undefined" />
  `,
})
class RendererTestHost {
    artifact: IntegrationDemoArtifact | undefined = {
        type: 'integration-demo',
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
        expect(library.query(By.css('.host-renderer')).nativeElement.textContent.trim())
            .toBe('host-owned-id: Host name / Host description');
        expect(library.query(By.css('h2')).nativeElement.textContent.trim()).toBe('Host headline');
    });

    it('keeps the banner and headline with a generic fallback when no renderer is supplied', () => {
        const fixture = TestBed.createComponent(RendererTestHost);
        fixture.componentInstance.showRenderer = false;
        fixture.detectChanges();

        expect(fixture.debugElement.query(By.css('h1')).nativeElement.textContent.trim()).toBe('Banner');
        expect(fixture.debugElement.query(By.css('h2'))).not.toBeNull();
        expect(fixture.debugElement.query(By.css('.fallback')).nativeElement.textContent.trim())
            .toBe('Vorschau nicht verfügbar.');
        expect(fixture.debugElement.query(By.css('.host-renderer'))).toBeNull();
        expect(fixture.nativeElement.textContent).not.toContain('host-owned-id');
    });

    it('shows only the banner when no artifact is supplied', () => {
        const fixture = TestBed.createComponent(RendererTestHost);
        fixture.componentInstance.artifact = undefined;
        fixture.detectChanges();

        expect(fixture.debugElement.query(By.css('.banner'))).not.toBeNull();
        expect(fixture.debugElement.query(By.css('.artifact'))).toBeNull();
    });

    it('inherits host CSS variables and responds to changes without a library rebuild', () => {
        const fixture = TestBed.createComponent(RendererTestHost);
        fixture.detectChanges();
        const host: HTMLElement = fixture.nativeElement;

        host.style.setProperty('--ai-chat-banner-background', 'rgb(20, 30, 40)');
        host.style.setProperty('--ai-chat-banner-text', 'rgb(230, 240, 250)');
        expect(host.style.getPropertyValue('--ai-chat-banner-background')).toBe('rgb(20, 30, 40)');
        expect(host.style.getPropertyValue('--ai-chat-banner-text')).toBe('rgb(230, 240, 250)');

        host.style.setProperty('--ai-chat-banner-background', 'rgb(50, 60, 70)');
        expect(host.style.getPropertyValue('--ai-chat-banner-background')).toBe('rgb(50, 60, 70)');

        host.style.removeProperty('--ai-chat-banner-background');
        host.style.removeProperty('--ai-chat-banner-text');
        expect(host.style.getPropertyValue('--ai-chat-banner-background')).toBe('');
        expect(host.style.getPropertyValue('--ai-chat-banner-text')).toBe('');
    });
});

describe('ChatUiDemoPageComponent', () => {
    it('retains the app header and renders the Kochwiki-owned static recipe', () => {
        const updateHeader = vi.fn().mockName('updateHeader');
        TestBed.configureTestingModule({
            imports: [ChatUiDemoPageComponent],
            providers: [{ provide: PageHeaderService, useValue: { updateHeader } }],
        });
        const fixture = TestBed.createComponent(ChatUiDemoPageComponent);
        fixture.detectChanges();

        expect(updateHeader).toHaveBeenCalledWith(true, 'Chat-UI Demo', '', false);
        const library = fixture.debugElement.query(By.directive(ChatUiComponent));
        expect(library.query(By.css('h3')).nativeElement.textContent.trim())
            .toBe(fixture.componentInstance.demoArtifact.payload.name);
        expect(library.query(By.css('.demo-recipe p')).nativeElement.textContent.trim())
            .toBe(fixture.componentInstance.demoArtifact.payload.description);
    });
});
