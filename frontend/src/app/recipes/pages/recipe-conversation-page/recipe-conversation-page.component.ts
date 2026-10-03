import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AgentConfiguration, ConversationController, ConversationViewState, HttpConversationTransport } from '@roithme0/chat-ui/conversation';
import { ChatArtifact, ChatSubmission, ChatUiComponent, artifactRenderer } from '@roithme0/chat-ui/ui';
import { ActiveUserService } from '../../../core/services/active-user.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipePresentationComponent } from '../../components/recipe-presentation/recipe-presentation.component';
import { mapConversationArtifact, mapSessionInput, recipeArtifact } from '../../conversation/recipe-conversation-contract';
import { SnackBarHandle, SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffPresentationComponent } from '../../../foodstuffs/components/foodstuff-presentation/foodstuff-presentation.component';
import { recipeProposalId, isRecipePresentation } from '../../presentation/recipe-artifact';
import { isFoodstuffPresentation } from '../../../foodstuffs/presentation/foodstuff-artifact';
import { NutritionCardComponent } from '../../../core/components/nutrition-card/nutrition-card.component';
import { isNutritionPresentation, nutritionBasisLabel } from '../../../core/presentation/nutrition-artifact';

function proposalSaveErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 404:
        return 'Dieser Vorschlag oder ein benötigter Eintrag ist nicht mehr verfügbar. Bitte erstelle einen neuen Vorschlag.';
      case 409:
        return 'Der Vorschlag konnte wegen eines Konflikts nicht gespeichert werden. Bitte überarbeite ihn.';
      case 422:
        return 'Der Entwurf konnte wegen ungültiger Rezeptdaten nicht gespeichert werden.';
    }
  }
  return 'Speichern konnte nicht bestätigt werden. Möglicherweise wurde der Entwurf bereits erstellt.';
}

@Component({
  selector: 'app-recipe-conversation-page',
  imports: [ChatUiComponent, RecipePresentationComponent, FoodstuffPresentationComponent, NutritionCardComponent, MatButtonModule, RouterLink],
  templateUrl: './recipe-conversation-page.component.html',
  styleUrl: './recipe-conversation-page.component.scss',
})
export class RecipeConversationPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly header = inject(PageHeaderService);
  private readonly recipes = inject(RecipeBackendService);
  private readonly activeUser = inject(ActiveUserService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackBarService);
  
  private saveEpoch = 0;
  private saveFeedback: SnackBarHandle | null = null;
  readonly savePending = signal(false);
  readonly recipeProposalId = recipeProposalId;

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
  readonly isFoodstuffPresentation = isFoodstuffPresentation;
  readonly isNutritionPresentation = isNutritionPresentation;
  readonly nutritionBasisLabel = nutritionBasisLabel;

  constructor() {
    let userId = this.activeUser.activeUser()?.id;
    effect(() => {
      const next = this.activeUser.activeUser()?.id;
      if (next !== userId) {
        userId = next;
        this.invalidateSaveFeedback();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.invalidateSaveFeedback();
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
    this.invalidateSaveFeedback();
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
      const source = structuredClone(await this.recipes.getRecipeVersion(this.lineageId, this.versionId));
      if (!this.isCurrent(generation)) return;
      if (source.state === 'historical' || source.recipeVersionId !== this.versionId || source.recipeLineageId !== this.lineageId) {
        this.phase.set('unavailable');
        return;
      }
      this.header.headline = source.name;
      this.original.set(recipeArtifact(`original-${source.recipeVersionId}`, `Original: ${source.name}`, source));
      const transport = new HttpConversationTransport('/ai/api/v1', AgentConfiguration.kochwiki, mapSessionInput(source));
      const controller = new ConversationController(transport, state => {
        if (this.isCurrent(generation)) this.view.set(state);
      }, mapConversationArtifact);
      this.controller = controller;
      this.view.set(controller.state);
      this.phase.set('ready');
      await controller.start();
    } catch (error: unknown) {
      if (!this.isCurrent(generation)) return;
      this.phase.set(error instanceof HttpErrorResponse && error.status === 404 ? 'unavailable' : 'error');
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
      'Die bestehende Unterhaltung wird ersetzt und geht verloren. Gespeicherte Entwürfe bleiben verfügbar. Laufende Speichervorgänge werden nicht abgebrochen. Neue Unterhaltung starten?',
    )) return;
    this.actionPending = true;
    await controller.performAction(action);
    if (!this.isCurrent(generation)) return;
    if (action === 'new-session' && controller.state.status === null) {
      this.invalidateSaveFeedback();
      this.setSubmitted(false);
    }
    this.actionPending = false;
  }

  canLeave(): boolean {
    return !this.submitted || this.activeUser.activeUser() === null || window.confirm(
      'Beim Verlassen geht diese Unterhaltung verloren. Gespeicherte Entwürfe bleiben verfügbar. Laufende Speichervorgänge werden nicht abgebrochen. Möchtest du die Seite verlassen?',
    );
  }

  async saveProposal(metadata: unknown): Promise<void> {
    const proposalId = recipeProposalId(metadata);
    if (this.savePending() || this.phase() !== 'ready' || !proposalId
      || this.destroyRef.destroyed || this.activeUser.activeUser() === null) return;
    const epoch = this.saveEpoch;
    const userId = this.activeUser.activeUser()?.id;
    this.savePending.set(true);
    const current = (): boolean => !this.destroyRef.destroyed && epoch === this.saveEpoch
      && userId === this.activeUser.activeUser()?.id;
    try {
      const draft = await this.recipes.saveRecipeProposal(proposalId);
      this.recipes.notifyRecipesChanged();
      if (!current()) return;
      this.saveFeedback?.dismiss();
      this.saveFeedback = this.snackbar.open('Entwurf gespeichert', {
        label: 'Entwurf öffnen',
        run: (): void => {
          if (current()) void this.router.navigate(['/recipes', draft.recipeLineageId, 'versions', draft.recipeVersionId]);
        },
      });
    } catch (error: unknown) {
      if (!current()) return;
      this.saveFeedback?.dismiss();
      this.saveFeedback = this.snackbar.open(proposalSaveErrorMessage(error));
    } finally {
      this.savePending.set(false);
    }
  }

  private invalidateSaveFeedback(): void {
    this.saveEpoch++;
    this.saveFeedback?.dismiss();
    this.saveFeedback = null;
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
