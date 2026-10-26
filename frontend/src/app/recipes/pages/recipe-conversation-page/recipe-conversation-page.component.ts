import {
  Component,
  DestroyRef,
  NgZone,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import {
  SessionController,
  SessionViewState,
  HttpSessionTransport,
} from '@roithme0/chat-ui/conversation';
import {
  ChatArtifact,
  ChatSubmission,
  ChatTurn,
  ChatUsage,
  ChatUiComponent,
  artifactRenderer,
} from '@roithme0/chat-ui/ui';
import { ActiveUserService } from '../../../core/services/active-user.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipePresentationComponent } from '../../components/recipe-presentation/recipe-presentation.component';
import {
  mapConversationArtifact,
  mapSessionInput,
  recipeArtifact,
} from '../../conversation/recipe-conversation-contract';
import {
  SnackBarHandle,
  SnackBarService,
} from '../../../core/services/snack-bar.service';
import { FoodstuffPresentationComponent } from '../../../foodstuffs/components/foodstuff-presentation/foodstuff-presentation.component';
import {
  recipeProposalId,
  isRecipePresentation,
} from '../../presentation/recipe-artifact';
import { isFoodstuffPresentation } from '../../../foodstuffs/presentation/foodstuff-artifact';
import { NutritionCardComponent } from '../../../core/components/nutrition-card/nutrition-card.component';
import {
  isNutritionPresentation,
  nutritionBasisLabel,
} from '../../../core/presentation/nutrition-artifact';

function proposalSaveErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 401:
        return 'Bitte melde dich erneut an, um den Vorschlag zu speichern.';
      case 403:
        return 'Nur der Besitzer des Rezepts kann diesen Vorschlag speichern.';
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
  imports: [
    ChatUiComponent,
    RecipePresentationComponent,
    FoodstuffPresentationComponent,
    NutritionCardComponent,
    MatButtonModule,
    RouterLink,
  ],
  templateUrl: './recipe-conversation-page.component.html',
  styleUrl: './recipe-conversation-page.component.scss',
})
export class RecipeConversationPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
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

  private controller: SessionController | null = null;
  private generation = 0;
  private conversationUserId: number | null = null;
  private submitted = false;
  private actionPending = false;
  private lineageId = '';
  private versionId = '';
  private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.submitted || this.activeUser.activeUser() === null) return;
    event.preventDefault();
    event.returnValue = '';
  };

  readonly phase = signal<
    'loading' | 'error' | 'unavailable' | 'waiting-for-user' | 'ready'
  >('loading');
  readonly back = signal('/recipes');
  readonly original = signal<ChatArtifact | null>(null);
  readonly view = signal<SessionViewState>({
    snapshot: null,
    admission: 'idle',
    observation: 'connecting',
    turns: [],
    composerDisabled: true,
    composerEditingDisabled: true,
    status: null,
  });
  readonly turns = computed<readonly ChatTurn[]>(() => {
    const original = this.original();
    const turns = this.view().turns;
    return original
      ? [
          {
            runKey: null,
            status: 'completed',
            content: [original],
          },
          ...turns,
        ]
      : turns;
  });
  readonly usage = computed<ChatUsage | null>(() => {
    const usage = this.view().snapshot?.usage;
    return usage
      ? {
          totalTokens: usage.total_tokens,
          estimatedCostUsd: usage.estimated_cost_usd,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          reasoningTokens: usage.reasoning_tokens,
          cacheReadTokens: usage.cache_read_tokens,
          cacheWriteTokens: usage.cache_write_tokens,
          requests: usage.requests,
          toolCalls: usage.tool_calls,
        }
      : null;
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
        void this.load();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.invalidateSaveFeedback();
      this.controller?.dispose();
      this.controller = null;
      this.setSubmitted(false);
      this.header.subheader = '';
    });
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.lineageId = params.get('lineageId') ?? '';
        this.versionId = params.get('recipeVersionId') ?? '';
        this.back.set(`/recipes/${this.lineageId}/versions/${this.versionId}`);
        void this.load();
      });
  }

  async load(): Promise<void> {
    const generation = ++this.generation;
    const user = this.activeUser.activeUser();
    const userId = user?.id ?? null;
    this.conversationUserId = userId;
    this.invalidateSaveFeedback();
    this.controller?.dispose();
    this.controller = null;
    this.actionPending = false;
    this.setSubmitted(false);
    this.original.set(null);
    this.view.set({
      snapshot: null,
      admission: 'idle',
      observation: 'connecting',
      turns: [],
      composerDisabled: true,
      composerEditingDisabled: true,
      status: null,
    });
    this.phase.set('loading');
    this.header.updateHeader(true, '', this.back(), true, 'Rezept verbessern');
    if (user === null) {
      this.phase.set('waiting-for-user');
      return;
    }
    if (!this.lineageId || !this.versionId) {
      this.phase.set('unavailable');
      return;
    }
    try {
      const source = structuredClone(
        await this.recipes.getRecipeVersion(this.lineageId, this.versionId),
      );
      if (!this.isCurrent(generation, userId)) return;
      if (
        source.ownerId !== userId ||
        source.state === 'historical' ||
        source.recipeVersionId !== this.versionId ||
        source.recipeLineageId !== this.lineageId
      ) {
        this.phase.set('unavailable');
        return;
      }
      this.header.headline = source.name;
      this.original.set(
        recipeArtifact(
          `original-${source.recipeVersionId}`,
          `Original: ${source.name}`,
          source,
        ),
      );
      const transport = new HttpSessionTransport(
        '/ai/api/v1',
        'kochwiki',
        `${encodeURIComponent(user.issuer)}:${encodeURIComponent(user.subject)}`,
      );
      const controller = new SessionController(
        transport,
        (state) => {
          if (this.isCurrent(generation, userId)) this.view.set(state);
        },
        mapConversationArtifact,
      );
      this.controller = controller;
      this.view.set(controller.state);
      this.phase.set('ready');
      await this.zone.runOutsideAngular(() =>
        controller.start(mapSessionInput(source)),
      );
    } catch (error: unknown) {
      if (!this.isCurrent(generation, userId)) return;
      this.phase.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'unavailable'
          : 'error',
      );
    }
  }

  async submit(submission: ChatSubmission): Promise<void> {
    const controller = this.controller;
    const generation = this.generation;
    const userId = this.conversationUserId;
    if (
      !this.isCurrent(generation, userId) ||
      !controller ||
      this.view().composerDisabled ||
      !submission.text.trim() ||
      this.actionPending
    )
      return;
    this.setSubmitted(true);
    await controller.submit(submission.text, () => {
      if (this.isCurrent(generation, userId) && this.controller === controller)
        submission.acknowledge();
    });
  }

  async performAction(action: string): Promise<void> {
    const controller = this.controller;
    const generation = this.generation;
    const userId = this.conversationUserId;
    if (
      !this.isCurrent(generation, userId) ||
      !controller ||
      this.actionPending ||
      this.view().status?.action?.id !== action
    )
      return;
    if (
      action === 'new-session' &&
      this.submitted &&
      !window.confirm(
        'Die bestehende Unterhaltung wird ersetzt und geht verloren. Gespeicherte Entwürfe bleiben verfügbar. Laufende Speichervorgänge werden nicht abgebrochen. Neue Unterhaltung starten?',
      )
    )
      return;
    this.actionPending = true;
    await controller.performAction(action);
    if (!this.isCurrent(generation, userId)) return;
    if (action === 'new-session' && controller.state.observation !== 'lost') {
      this.invalidateSaveFeedback();
      this.setSubmitted(false);
    }
    this.actionPending = false;
  }

  canLeave(): boolean {
    return (
      !this.submitted ||
      this.activeUser.activeUser() === null ||
      window.confirm(
        'Beim Verlassen geht diese Unterhaltung verloren. Gespeicherte Entwürfe bleiben verfügbar. Laufende Speichervorgänge werden nicht abgebrochen. Möchtest du die Seite verlassen?',
      )
    );
  }

  async saveProposal(metadata: unknown): Promise<void> {
    const proposalId = recipeProposalId(metadata);
    if (
      this.savePending() ||
      this.phase() !== 'ready' ||
      !proposalId ||
      this.destroyRef.destroyed ||
      !this.isCurrent(this.generation, this.conversationUserId)
    )
      return;
    const epoch = this.saveEpoch;
    const userId = this.activeUser.activeUser()?.id;
    this.savePending.set(true);
    const current = (): boolean =>
      !this.destroyRef.destroyed &&
      epoch === this.saveEpoch &&
      userId === this.activeUser.activeUser()?.id;
    try {
      const draft = await this.recipes.saveRecipeProposal(proposalId);
      this.recipes.notifyRecipesChanged();
      if (!current()) return;
      this.saveFeedback?.dismiss();
      this.saveFeedback = this.snackbar.open('Entwurf gespeichert', {
        label: 'Entwurf öffnen',
        run: (): void => {
          if (current())
            void this.router.navigate([
              '/recipes',
              draft.recipeLineageId,
              'versions',
              draft.recipeVersionId,
            ]);
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

  private isCurrent(generation: number, userId: number | null): boolean {
    return (
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      userId !== null &&
      userId === this.activeUser.activeUser()?.id
    );
  }

  private setSubmitted(value: boolean): void {
    this.submitted = value;
    if (value) window.addEventListener('beforeunload', this.beforeUnload);
    else window.removeEventListener('beforeunload', this.beforeUnload);
  }
}
