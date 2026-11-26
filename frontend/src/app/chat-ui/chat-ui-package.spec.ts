import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ChatUiComponent,
  artifactRenderer,
  type ChatArtifact,
  type ChatTurn,
} from '@roithme0/chat-ui/ui';

@Component({
  imports: [ChatUiComponent],
  template: `
    <ng-template #hostRenderer let-payload let-artifact="artifact">
      <p class="host-renderer">
        {{ artifact.id }}: {{ payload.name }} / {{ payload.description }}
      </p>
    </ng-template>
    <ai-chat-ui
      bannerTitle="Banner"
      bannerDescription="Description"
      [turns]="turns"
      [artifactRenderers]="
        showRenderer ? { 'host-content': artifactRenderer(hostRenderer) } : {}
      "
    />
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
  get turns(): readonly ChatTurn[] {
    return this.artifact
      ? [
          {
            runKey: 'host-turn',
            status: 'completed',
            content: [this.artifact],
          },
        ]
      : [];
  }
  showRenderer = true;
}

describe('Packaged chat UI integration', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RendererTestHost] });
  });

  it('renders the artifact ID and payload fields using the host renderer', () => {
    const fixture = TestBed.createComponent(RendererTestHost);
    fixture.detectChanges();

    const library = fixture.debugElement.query(By.directive(ChatUiComponent));
    const element: HTMLElement = library.nativeElement as HTMLElement;
    expect(element.querySelector('.host-renderer')?.textContent?.trim()).toBe(
      'host-owned-id: Host name / Host description',
    );
    expect(element.querySelector('.artifact h3')?.textContent?.trim()).toBe(
      'Host headline',
    );
  });
});
