import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AgentConfiguration, ConversationController, ConversationViewState, HttpConversationTransport } from '@roithme0/chat-ui/conversation';
import { ChatArtifact, ChatSubmission, ChatUiComponent, artifactRenderer } from '@roithme0/chat-ui/ui';
import { ActiveUserService } from '../../../core/services/active-user.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { FoodstuffBackendService } from '../../../foodstuffs/services/foodstuff-backend.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipePresentationComponent } from '../../components/recipe-presentation/recipe-presentation.component';
import { isRecipePresentation, mapProposalArtifact, mapSessionInput, recipeArtifact } from '../../conversation/recipe-conversation-contract';

@Component({
  selector: 'app-recipe-conversation-page',
  imports: [ChatUiComponent, RecipePresentationComponent, MatButtonModule, RouterLink],
  templateUrl: './recipe-conversation-page.component.html',
  styleUrl: './recipe-conversation-page.component.scss',
})
export class RecipeConversationPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly header = inject(PageHeaderService);
  private readonly recipes = inject(RecipeBackendService);
  private readonly foodstuffs = inject(FoodstuffBackendService);
  private readonly activeUser = inject(ActiveUserService);
  
  private controller: ConversationController | null = null;
  private generation = 0;
  private submitted = false;
  private actionPending = false;
  private lineageId = '';
  private versionId = '';
  private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.submitted || this.activeUser.activeUser() === null) return;
    event.preventDefault();
    event.returnValue = '';
  };

  readonly phase = signal<'loading' | 'error' | 'unavailable' | 'ready'>('loading');
  readonly back = signal('/recipes');
  readonly original = signal<ChatArtifact | null>(null);
  readonly view = signal<ConversationViewState>({ content: [], composerDisabled: true, status: null });
  readonly content = computed(() => {
    const original = this.original();
    return original ? [original, ...this.view().content] : this.view().content;
  });
  readonly artifactRenderer = artifactRenderer;
  readonly isRecipePresentation = isRecipePresentation;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.controller = null;
      this.setSubmitted(false);
      this.header.subheader = '';
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.lineageId = params.get('lineageId') ?? '';
      this.versionId = params.get('recipeVersionId') ?? '';
      this.back.set(`/recipes/${this.lineageId}/versions/${this.versionId}`);
      void this.load();
    });
  }

  async load(): Promise<void> {
    const generation = ++this.generation;
    this.controller = null;
    this.actionPending = false;
    this.setSubmitted(false);
    this.original.set(null);
    this.view.set({ content: [], composerDisabled: true, status: null });
    this.phase.set('loading');
    this.header.updateHeader(true, '', this.back(), true, 'Rezept verbessern');
    if (!this.lineageId || !this.versionId) {
      this.phase.set('unavailable');
      return;
    }
    try {
      const [sourceResult, catalogResult] = await Promise.allSettled([
        this.recipes.getRecipeVersion(this.lineageId, this.versionId).then(value => structuredClone(value)),
        this.foodstuffs.getAllFoodstuffs().then(value => structuredClone(value)),
      ]);
      if (!this.isCurrent(generation)) return;
      if (sourceResult.status === 'rejected') {
        const error: unknown = sourceResult.reason;
        this.phase.set(error instanceof HttpErrorResponse && error.status === 404 ? 'unavailable' : 'error');
        return;
      }
      const source = sourceResult.value;
      if (source.state === 'historical' || source.recipeVersionId !== this.versionId || source.recipeLineageId !== this.lineageId) {
        this.phase.set('unavailable');
        return;
      }
      if (catalogResult.status === 'rejected') {
        this.phase.set('error');
        return;
      }
      const catalog = catalogResult.value;
      this.header.headline = source.name;
      this.original.set(recipeArtifact(`original-${source.recipeVersionId}`, `Original: ${source.name}`, source));
      const transport = new HttpConversationTransport('/ai/api/v1', AgentConfiguration.Kochwiki, mapSessionInput(source, catalog));
      const controller = new ConversationController(transport, state => {
        if (this.isCurrent(generation)) this.view.set(state);
      }, mapProposalArtifact);
      this.controller = controller;
      this.view.set(controller.state);
      this.phase.set('ready');
      await controller.start();
    } catch {
      if (!this.isCurrent(generation)) return;
      this.phase.set('error');
    }
  }

  async submit(submission: ChatSubmission): Promise<void> {
    const controller = this.controller;
    const generation = this.generation;
    if (!controller || this.view().composerDisabled || !submission.text.trim() || this.actionPending) return;
    this.setSubmitted(true);
    await controller.submit(submission.text, () => {
      if (this.isCurrent(generation) && this.controller === controller) submission.acknowledge();
    });
  }

  async performAction(action: string): Promise<void> {
    const controller = this.controller;
    const generation = this.generation;
    if (!controller || this.actionPending || this.view().status?.action?.id !== action) return;
    if (action === 'new-session' && this.submitted && !window.confirm(
      'Die bestehende Unterhaltung wird ersetzt und geht verloren. Neue Unterhaltung starten?',
    )) return;
    this.actionPending = true;
    await controller.performAction(action);
    if (!this.isCurrent(generation)) return;
    if (action === 'new-session' && controller.state.status === null) this.setSubmitted(false);
    this.actionPending = false;
  }

  canLeave(): boolean {
    return !this.submitted || this.activeUser.activeUser() === null || window.confirm(
      'Beim Verlassen geht diese Unterhaltung verloren. Möchtest du die Seite verlassen?',
    );
  }

  private isCurrent(generation: number): boolean {
    return !this.destroyRef.destroyed && generation === this.generation;
  }

  private setSubmitted(value: boolean): void {
    this.submitted = value;
    if (value) window.addEventListener('beforeunload', this.beforeUnload);
    else window.removeEventListener('beforeunload', this.beforeUnload);
  }
}
