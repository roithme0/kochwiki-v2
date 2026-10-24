import type { UserOut } from '../../../core/api/generated';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { backendUrl } from '../../../core/constants/api';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { By } from '@angular/platform-browser';
import { ChatUiComponent } from '@roithme0/chat-ui/ui';
import type {
  PresentedSession,
  SessionEvent,
} from '@roithme0/chat-ui/conversation';
import { FoodstuffPresentationComponent } from '../../../foodstuffs/components/foodstuff-presentation/foodstuff-presentation.component';
import { NutritionCardComponent } from '../../../core/components/nutrition-card/nutrition-card.component';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { ActiveUserService } from '../../../core/services/active-user.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import {
  mapConversationArtifact,
  mapSessionInput,
  type RecipeSessionArtifact,
} from '../../conversation/recipe-conversation-contract';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipePresentationComponent } from '../../components/recipe-presentation/recipe-presentation.component';
import {
  conversationProposal,
  conversationRecipe,
  proposalId,
} from '../../conversation/recipe-conversation.fixtures';
import { RecipeConversationPageComponent } from './recipe-conversation-page.component';

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

@Component({ template: '' })
class EmptyPage {}

describe('Recipe conversation page through published session controller and HTTP transport', () => {
  let fixture: ComponentFixture<RecipeConversationPageComponent>;
  let source: ReturnType<typeof conversationRecipe>;
  const save = vi.fn<RecipeBackendService['saveRecipeProposal']>();
  const notify = vi.fn();
  const dismiss = vi.fn();
  const snackbar = vi.fn<SnackBarService['open']>();
  const getRecipe = vi.fn<RecipeBackendService['getRecipeVersion']>();
  const fetchMock = vi.fn<typeof fetch>();
  const user = signal<UserOut | null>({
    id: 1,
    display_name: 'Test',
    issuer: 'https://idp.example/realms/test',
    subject: 'user-1',
  });
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let history: PresentedSession['history'];
  let streams: {
    controller: ReadableStreamDefaultController<Uint8Array>;
    signal: AbortSignal | null | undefined;
  }[];
  const createUrl = `${backendUrl}/recipe-conversations`;
  const sessionUrl = '/ai/api/v1/agents/kochwiki/sessions';

  function snapshot(): PresentedSession {
    return {
      session_id: 'session-1',
      expires_at: '2026-10-23T00:00:00Z',
      error: null,
      history: structuredClone(history),
    };
  }

  function emit(event: SessionEvent): void {
    const stream = streams.at(-1);
    if (!stream) throw new Error('No session observer');
    stream.controller.enqueue(
      new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
    );
  }

  function publish(): void {
    emit({ kind: 'snapshot', snapshot: snapshot() });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    history = [];
    streams = [];
    snackbar.mockReturnValue({ dismiss });
    save.mockResolvedValue({
      ...conversationRecipe(),
      state: 'draft',
      recipeVersionId: 'saved',
    });
    user.set({
      id: 1,
      display_name: 'Test',
      issuer: 'https://idp.example/realms/test',
      subject: 'user-1',
    });
    source = conversationRecipe();
    params = new BehaviorSubject(
      convertToParamMap({
        lineageId: source.recipeLineageId,
        recipeVersionId: source.recipeVersionId,
      }),
    );
    getRecipe.mockResolvedValue(source);
    fetchMock.mockImplementation((url, options) => {
      const address = requestUrl(url);
      if (address.endsWith('/events')) {
        let closed = false;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            streams.push({ controller, signal: options?.signal });
            publish();
            options?.signal?.addEventListener(
              'abort',
              () => {
                if (!closed) {
                  closed = true;
                  controller.close();
                }
              },
              { once: true },
            );
          },
          cancel() {
            closed = true;
          },
        });
        return Promise.resolve(
          new Response(body, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
      }
      if (address.endsWith('/turns'))
        return Promise.resolve(response({ kind: 'accepted' }, 202));
      history = [];
      return Promise.resolve(
        response(
          { session_id: 'session-1', expires_at: '2026-10-23T00:00:00Z' },
          201,
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      imports: [RecipeConversationPageComponent],
      providers: [
        provideRouter([{ path: '**', component: EmptyPage }]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        {
          provide: RecipeBackendService,
          useValue: {
            getRecipeVersion: getRecipe,
            saveRecipeProposal: save,
            notifyRecipesChanged: notify,
          },
        },
        { provide: SnackBarService, useValue: { open: snackbar } },
        { provide: ActiveUserService, useValue: { activeUser: user } },
      ],
    });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function open(): Promise<RecipeConversationPageComponent> {
    fixture = TestBed.createComponent(RecipeConversationPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(fixture.componentInstance.view().status?.kind).not.toBe('loading'),
    );
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  function complete(
    artifacts: RecipeSessionArtifact[],
    text = 'Mehr Gem?se',
    status: 'running' | 'completed' | 'failed' = 'completed',
  ): void {
    const runId = `run-${history.length + 1}`;
    history.push(
      { part_kind: 'user-prompt', content: text },
      {
        part_kind: 'turn',
        lifecycle: {
          run_id: runId,
          status,
          started_at: '2026-10-21T00:00:00Z',
          finished_at: status === 'running' ? null : '2026-10-21T00:01:00Z',
        },
        parts: [
          {
            part_kind: 'text',
            content: 'Ein Vorschlag',
            phase: 'final_answer',
          },
          ...artifacts.map((artifact) => ({
            part_kind: 'artifact' as const,
            artifact: { ...artifact, run_id: runId },
          })),
        ],
      },
    );
    publish();
  }

  async function submitArtifacts(
    page: RecipeConversationPageComponent,
    artifacts: RecipeSessionArtifact[],
    text = 'Mehr Gem?se',
  ): Promise<void> {
    await page.submit({ text, acknowledge: vi.fn() });
    complete(artifacts, text);
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    fixture.detectChanges();
  }

  async function submit(page: RecipeConversationPageComponent): Promise<void> {
    await submitArtifacts(page, [
      { ...conversationProposal(), artifact_id: `proposal-${history.length}` },
      {
        ...conversationProposal(),
        artifact_id: `bad-${history.length}`,
        content: { title: 'Bad', payload: {} },
      },
    ]);
  }

  it('renders explicitly presented foodstuff name, brand and nutrition without writes or enrichment fetches', async () => {
    const page = await open();
    await submitArtifacts(page, [
      {
        ...conversationProposal(),
        type: 'kochwiki-foodstuff',
        content: {
          title: 'Linsen',
          subtitle: 'Meine Marke',
          payload: { unit: 'G', kcal: 200, carbs: 12, protein: 8, fat: 4 },
        },
      },
    ]);
    expect(
      fixture.debugElement.queryAll(
        By.directive(FoodstuffPresentationComponent),
      ),
    ).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Meine Marke',
    );
    const cards = fixture.debugElement.queryAll(
      By.directive(NutritionCardComponent),
    );
    expect(
      cards.map((card) =>
        (card.componentInstance as NutritionCardComponent).basis(),
      ),
    ).toContain('pro 100 g');
    expect(getRecipe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: 'Linsen',
      subtitle: 'Meine Marke',
      basis: 'per-100-g',
      label: 'pro 100 g',
    },
    { title: 'Linsensuppe', basis: 'per-serving', label: 'pro Portion' },
    { title: 'Linsensuppe', basis: 'whole-recipe', label: 'gesamtes Rezept' },
  ])(
    'renders dedicated nutrition for $title with $basis without save actions',
    async (item) => {
      const page = await open();
      const payload = {
        basis: item.basis,
        kcal: { status: 'minimum', value: 200 },
        carbs: { status: 'unknown', value: null },
        protein: { status: 'exact', value: 8 },
        fat: { status: 'minimum', value: 0 },
      };
      await submitArtifacts(page, [
        {
          ...conversationProposal(),
          type: 'kochwiki-nutrition',
          content: { title: item.title, subtitle: item.subtitle, payload },
        },
      ]);
      const cards = fixture.debugElement.queryAll(
        By.directive(NutritionCardComponent),
      );
      expect(cards).toHaveLength(2);
      const card = cards[1].componentInstance as NutritionCardComponent;
      expect(card.basis()).toBe(item.label);
      expect(card.nutrition()).toEqual(payload);
      expect(
        fixture.debugElement.queryAll(
          By.directive(FoodstuffPresentationComponent),
        ),
      ).toHaveLength(0);
      expect(
        fixture.debugElement.queryAll(
          By.directive(RecipePresentationComponent),
        ),
      ).toHaveLength(1);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        item.title,
      );
      if (item.subtitle)
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(
          item.subtitle,
        );
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          'button.proposal-save',
        ),
      ).toBeNull();
      expect(getRecipe).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('renders a recipe with temporary ingredients and preparation time without saving or fetching', async () => {
    const page = await open();
    const payload = {
      servings: 2,
      preptime: 25,
      kcal: { status: 'unknown', value: null },
      carbs: { status: 'unknown', value: null },
      protein: { status: 'unknown', value: null },
      fat: { status: 'unknown', value: null },
      ingredients: [
        {
          index: 1,
          amount: 100,
          foodstuff: {
            name: 'Neue Zutat',
            imageId: null,
            unitVerbose: 'g',
            kcal: null,
            carbs: null,
            protein: null,
            fat: null,
          },
        },
      ],
      steps: [{ index: 1, description: 'Neue Zutat schneiden.' }],
    };
    await submitArtifacts(page, [
      {
        ...conversationProposal(),
        content: { title: 'Neues Rezept', payload },
      },
    ]);
    const recipes = fixture.debugElement.queryAll(
      By.directive(RecipePresentationComponent),
    );
    expect(
      recipes.some(
        (recipe) =>
          (recipe.componentInstance as RecipePresentationComponent).recipe()
            .ingredients[0].foodstuff.name === 'Neue Zutat',
      ),
    ).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      '25 min',
    );
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Neues Rezept',
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'button.proposal-save',
      ),
    ).toBeNull();
    expect(getRecipe).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('renders an explicit JSON artifact without recipe save actions', async () => {
    const page = await open();
    await submitArtifacts(page, [
      {
        ...conversationProposal(),
        type: 'json',
        content: {
          title: 'Foodstuff',
          payload: { value: { name: 'Linsen', unit: 'G' } },
        },
      },
    ]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('pre')?.textContent,
    ).toContain('"name": "Linsen"');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'button.proposal-save',
      ),
    ).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('renders proposals while execution is running, permits draft edits and blocks overlapping submissions until terminal snapshot', async () => {
    const page = await open();
    const acknowledge = vi.fn();
    await page.submit({ text: 'Mehr Gem?se', acknowledge });
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(page.view().turns).toEqual([]);
    complete([conversationProposal()], 'Mehr Gem?se', 'running');
    await vi.waitFor(() => expect(page.view().turns).toHaveLength(2));
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'button.proposal-save',
      ),
    ).not.toBeNull();
    expect(page.view().composerDisabled).toBe(true);
    expect(page.view().composerEditingDisabled).toBe(false);
    const chat = fixture.debugElement.query(By.directive(ChatUiComponent))
      .componentInstance as ChatUiComponent;
    expect(chat.composerEditingDisabled()).toBe(false);
    await page.submit({ text: 'Too soon', acknowledge: vi.fn() });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const run = history.at(-1);
    if (run?.part_kind !== 'turn') throw new Error('Expected run');
    run.lifecycle.status = 'completed';
    run.lifecycle.finished_at = '2026-10-21T00:01:00Z';
    publish();
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    expect(page.view().status).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('retains artifacts after observation loss, reconnects without resubmitting and trusts terminal snapshots', async () => {
    const page = await open();
    await page.submit({ text: 'Mehr Gem?se', acknowledge: vi.fn() });
    complete([conversationProposal()], 'Mehr Gem?se', 'running');
    await vi.waitFor(() => expect(page.view().turns).toHaveLength(2));
    emit({ kind: 'error', reason: 'observation_overflow' });
    await vi.waitFor(() => expect(page.view().observation).toBe('lost'));
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'button.proposal-save',
      ),
    ).not.toBeNull();
    expect(page.view().composerDisabled).toBe(true);
    const run = history.at(-1);
    if (run?.part_kind !== 'turn') throw new Error('Expected run');
    run.lifecycle.status = 'completed';
    run.lifecycle.finished_at = '2026-10-21T00:01:00Z';
    await vi.waitFor(() => expect(page.view().observation).toBe('connected'), {
      timeout: 2500,
    });
    expect(page.view().composerDisabled).toBe(false);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        requestUrl(url).endsWith('/turns'),
      ),
    ).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps an unconfirmed draft and disables resubmission after admission uncertainty', async () => {
    const page = await open();
    fetchMock.mockRejectedValueOnce(new TypeError('Network failed'));
    const acknowledge = vi.fn();
    await page.submit({ text: 'Mehr Gem?se', acknowledge });
    expect(acknowledge).not.toHaveBeenCalled();
    expect(page.view().admission).toBe('uncertain');
    expect(page.view().composerDisabled).toBe(true);
    complete([conversationProposal()]);
    await vi.waitFor(() => expect(page.view().turns).toHaveLength(2));
    await page.submit({ text: 'Retry?', acknowledge });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('shows conversation exhaustion without losing presented artifacts or offering a retry', async () => {
    const page = await open();
    await submit(page);
    emit({
      kind: 'snapshot',
      snapshot: { ...snapshot(), error: 'conversation_limit_reached' },
    });
    await vi.waitFor(() =>
      expect(page.view().status?.message).toBe('Conversation limit reached'),
    );
    expect(page.view().composerDisabled).toBe(true);
    expect(page.view().status?.action).toBeUndefined();
    expect(
      page
        .view()
        .turns.flatMap((turn) => turn.content)
        .some((item) => item.kind === 'artifact'),
    ).toBe(true);
  });
  it.each(['active', 'draft'] as const)(
    'saves a stored proposal from %s with no overlapping requests',
    async (state) => {
      source.state = state;
      const page = await open();
      await submit(page);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).textContent.match(
          /Als Entwurf speichern/g,
        ),
      ).toHaveLength(1);
      const payload = mapConversationArtifact(conversationProposal()).metadata;
      const pending = deferred<ReturnType<typeof conversationRecipe>>();
      save.mockReturnValueOnce(pending.promise);
      const operation = page.saveProposal(payload);
      await page.saveProposal(payload);
      await page.saveProposal(
        mapConversationArtifact({
          ...conversationProposal(),
          artifact_id: 'another',
        }).metadata,
      );
      await page.saveProposal(page.original()?.metadata);
      expect(save).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
      expect(save).toHaveBeenCalledWith(proposalId);
      pending.resolve({
        ...conversationRecipe(),
        recipeVersionId: 'returned',
        state: 'draft',
      });
      await operation;
      expect(notify).toHaveBeenCalledTimes(1);
      expect(snackbar).toHaveBeenCalledWith(
        'Entwurf gespeichert',
        expect.objectContaining({ label: 'Entwurf öffnen' }),
      );
      expect(page.savePending()).toBe(false);
      await page.saveProposal(payload);
      expect(save).toHaveBeenCalledTimes(2);
      expect(getRecipe).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects non-actionable metadata and restores availability after failures', async () => {
    const page = await open();
    const payload = { proposalId };
    await page.saveProposal(null);
    await page.saveProposal(page.original()?.metadata);
    expect(save).not.toHaveBeenCalled();
    save.mockRejectedValueOnce(new HttpErrorResponse({ status: 422 }));
    await page.saveProposal(payload);
    expect(save).toHaveBeenCalledWith(proposalId);
    expect(snackbar.mock.calls[0][0]).toContain('ungültiger Rezeptdaten');
    save.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await page.saveProposal(payload);
    expect(snackbar.mock.calls[1][0]).toContain('Möglicherweise');
    expect(page.savePending()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, 'erneut an'],
    [403, 'Besitzer'],
    [404, 'neuen Vorschlag'],
    [409, 'Konflikts'],
  ] as const)(
    'reports a definite HTTP %s failure without suggesting the draft may have been created',
    async (status, message) => {
      const page = await open();
      save.mockRejectedValueOnce(new HttpErrorResponse({ status }));
      await page.saveProposal({ proposalId });
      expect(snackbar.mock.calls[0][0]).toContain(message);
      expect(snackbar.mock.calls[0][0]).not.toContain('Möglicherweise');
      expect(notify).not.toHaveBeenCalled();
      expect(page.savePending()).toBe(false);
    },
  );

  it('saves the proposal advertised by the artifact button, without constructing recipe data', async () => {
    const page = await open();
    await submit(page);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button.proposal-save',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith(proposalId));
    expect(save.mock.calls[0]).toEqual([proposalId]);
    await vi.waitFor(() => expect(page.savePending()).toBe(false));
  });

  it('treats a malformed successful draft response as unconfirmed without retry or open action', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.overrideProvider(RecipeBackendService, {
      useFactory: () => {
        const service = new RecipeBackendService();
        service.getRecipeVersion = getRecipe;
        service.notifyRecipesChanged = notify;
        return service;
      },
    });
    const page = await open();
    await submit(page);
    const original = page.original();
    const content = page.view().turns;
    const operation = page.saveProposal(
      mapConversationArtifact(conversationProposal()).metadata,
    );
    const http = TestBed.inject(HttpTestingController);
    const url = `${backendUrl}/recipe-proposals/${proposalId}/save`;
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush(
      { recipeLineageId: source.recipeLineageId, recipeVersionId: 'invalid' },
      { status: 201, statusText: 'Created' },
    );
    await operation;
    expect(notify).not.toHaveBeenCalled();
    expect(snackbar).toHaveBeenCalledTimes(1);
    expect(snackbar).toHaveBeenCalledWith(
      'Speichern konnte nicht bestätigt werden. Möglicherweise wurde der Entwurf bereits erstellt.',
    );
    expect(page.original()).toBe(original);
    expect(page.view().turns).toBe(content);
    expect(page.savePending()).toBe(false);
    http.expectNone(url);
    http.verify();
  });

  it.each(['destroy', 'route', 'user'] as const)(
    'suppresses deferred save feedback after %s',
    async (boundary) => {
      const page = await open();
      const pending = deferred<ReturnType<typeof conversationRecipe>>();
      save.mockReturnValueOnce(pending.promise);
      const operation = page.saveProposal(
        mapConversationArtifact(conversationProposal()).metadata,
      );
      if (boundary === 'destroy') fixture.destroy();
      if (boundary === 'user') user.set(null);
      if (boundary === 'route') {
        const next = { ...conversationRecipe(), recipeVersionId: 'next' };
        getRecipe.mockResolvedValueOnce(next);
        params.next(
          convertToParamMap({
            lineageId: next.recipeLineageId,
            recipeVersionId: next.recipeVersionId,
          }),
        );
      }
      pending.resolve(conversationRecipe());
      await operation;
      expect(snackbar).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the outstanding lock across successful replacement and suppresses old feedback', async () => {
    const page = await open();
    await submit(page);
    const payload = mapConversationArtifact(conversationProposal()).metadata;
    const pending = deferred<ReturnType<typeof conversationRecipe>>();
    save.mockReturnValueOnce(pending.promise);
    const operation = page.saveProposal(payload);
    fetchMock.mockResolvedValueOnce(response({ kind: 'unknown' }, 404));
    await page.submit({ text: 'More', acknowledge: vi.fn() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await page.performAction('new-session');
    await page.saveProposal(payload);
    expect(save).toHaveBeenCalledTimes(1);
    pending.resolve(conversationRecipe());
    await operation;
    expect(snackbar).not.toHaveBeenCalled();
    await page.saveProposal(payload);
    expect(save).toHaveBeenCalledTimes(2);
    expect(page.savePending()).toBe(false);
  });

  it('keeps a deferred save and its feedback valid through a failed replacement', async () => {
    const page = await open();
    await submit(page);
    const payload = mapConversationArtifact(conversationProposal()).metadata;
    const pending = deferred<ReturnType<typeof conversationRecipe>>();
    save.mockReturnValueOnce(pending.promise);
    const operation = page.saveProposal(payload);
    fetchMock.mockResolvedValueOnce(response({ kind: 'unknown' }, 404));
    await page.submit({ text: 'More', acknowledge: vi.fn() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(
      response({ kind: 'agent_unavailable', detail: 'Agent unavailable' }, 503),
    );
    await page.performAction('new-session');
    await page.saveProposal(payload);
    expect(save).toHaveBeenCalledTimes(1);
    pending.resolve(conversationRecipe());
    await operation;
    expect(snackbar).toHaveBeenCalledWith(
      'Entwurf gespeichert',
      expect.any(Object),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(page.canLeave()).toBe(false);
  });

  it('retains save feedback and leave protection after failed replacement, then dismisses it on successful replacement', async () => {
    const page = await open();
    await submit(page);
    await page.saveProposal(
      mapConversationArtifact(conversationProposal()).metadata,
    );
    fetchMock.mockResolvedValueOnce(response({ kind: 'unknown' }, 404));
    await page.submit({ text: 'More', acknowledge: vi.fn() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(
      response({ kind: 'agent_unavailable', detail: 'Agent unavailable' }, 503),
    );
    await page.performAction('new-session');
    expect(dismiss).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(page.canLeave()).toBe(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await page.performAction('new-session');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('captures context and capabilities once, then refines through the same observed session without writes', async () => {
    const page = await open();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      createUrl,
      `${sessionUrl}/session-1/events`,
    ]);
    const body = fetchMock.mock.calls[0][1]?.body;
    if (typeof body !== 'string') throw new Error('Expected JSON request body');
    expect(JSON.parse(body) as unknown).toEqual({
      sourceRecipeVersionId: source.recipeVersionId,
      artifact_capabilities: mapSessionInput().artifact_capabilities,
    });
    expect(getRecipe).toHaveBeenCalledWith(
      source.recipeLineageId,
      source.recipeVersionId,
    );
    const header = TestBed.inject(PageHeaderService);
    expect(header.headline()).toBe(source.name);
    expect(header.subheader()).toBe('Rezept verbessern');
    expect(header.back()).toBe(
      `/recipes/${source.recipeLineageId}/versions/${source.recipeVersionId}`,
    );
    const original = page.original();
    await submit(page);
    await submit(page);
    expect(page.original()).toBe(original);
    expect(page.view().turns.map((turn) => turn.status)).toEqual([
      'prompt',
      'completed',
      'prompt',
      'completed',
    ]);
    expect(page.turns()[0].content).toEqual([original]);
    expect(page.turns().slice(1)).toEqual(page.view().turns);
    expect(
      page
        .view()
        .turns.flatMap((turn) => turn.content)
        .filter((item) => item.kind === 'text'),
    ).toHaveLength(4);
    expect(
      fixture.debugElement.queryAll(By.directive(RecipePresentationComponent)),
    ).toHaveLength(3);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Inhalt nicht darstellbar',
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      createUrl,
      `${sessionUrl}/session-1/events`,
      `${sessionUrl}/session-1/turns`,
      `${sessionUrl}/session-1/turns`,
    ]);
    expect(fetchMock.mock.calls[2][1]?.body).toBe(
      JSON.stringify({ prompt: 'Mehr Gem?se' }),
    );
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    [
      'https://idp.example/realms/a',
      'cook',
      'https%3A%2F%2Fidp.example%2Frealms%2Fa:cook',
    ],
    [
      'https://idp.example/realms/b',
      'cook',
      'https%3A%2F%2Fidp.example%2Frealms%2Fb:cook',
    ],
    [
      'https://idp.example/realms/a',
      'other:cook',
      'https%3A%2F%2Fidp.example%2Frealms%2Fa:other%3Acook',
    ],
  ])(
    'uses issuer %s and subject %s for conversation ownership',
    async (issuer, subject, identity) => {
      user.set({ id: 1, display_name: 'Test', issuer, subject });
      await open();
      expect(
        new Headers(fetchMock.mock.calls[1][1]?.headers).get(
          'X-Application-User',
        ),
      ).toBe(identity);
    },
  );

  it('uses the authenticated creation relay and stable identity for direct observation and prompt admission', async () => {
    const page = await open();
    user.set({
      id: 1,
      display_name: 'Renamed',
      issuer: 'https://idp.example/realms/test',
      subject: 'user-1',
    });
    fixture.detectChanges();
    await submit(page);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      new Headers(fetchMock.mock.calls[0][1]?.headers).has(
        'X-Application-User',
      ),
    ).toBe(false);
    for (const [, request] of fetchMock.mock.calls.slice(1)) {
      expect(new Headers(request?.headers).get('X-Application-User')).toBe(
        'https%3A%2F%2Fidp.example%2Frealms%2Ftest:user-1',
      );
    }
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Accept')).toBe(
      'text/event-stream',
    );
  });

  it('waits for authentication before loading context or creating a session', async () => {
    user.set(null);
    const page = await open();
    expect(getRecipe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(page.phase()).toBe('waiting-for-user');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Anmelden',
    );
    expect(page.original()).toBeNull();
    source.ownerId = 2;
    user.set({
      id: 2,
      display_name: 'Restored',
      issuer: 'https://idp.example/realms/test',
      subject: 'user-2',
    });
    fixture.detectChanges();
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetchMock.mock.calls[1][1]?.headers).get(
        'X-Application-User',
      ),
    ).toBe('https%3A%2F%2Fidp.example%2Frealms%2Ftest:user-2');
  });

  it('blocks old-owner actions immediately and ignores late admission before user effects flush', async () => {
    const page = await open();
    await submit(page);
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const acknowledge = vi.fn();
    const operation = page.submit({ text: 'Old owner', acknowledge });
    const requests = fetchMock.mock.calls.length;
    source.ownerId = 2;
    user.set({
      id: 2,
      display_name: 'Next',
      issuer: 'https://idp.example/realms/test',
      subject: 'user-2',
    });
    await page.submit({
      text: 'Must not use old session',
      acknowledge: vi.fn(),
    });
    await page.saveProposal(
      mapConversationArtifact(conversationProposal()).metadata,
    );
    expect(fetchMock).toHaveBeenCalledTimes(requests);
    expect(save).not.toHaveBeenCalled();
    pending.resolve(response({ kind: 'accepted' }, 202));
    await operation;
    expect(acknowledge).not.toHaveBeenCalled();
    fixture.detectChanges();
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    expect(page.view().turns).toEqual([]);
    expect(
      new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get(
        'X-Application-User',
      ),
    ).toBe('https%3A%2F%2Fidp.example%2Frealms%2Ftest:user-2');
  });

  it.each(['success', 'failure'] as const)(
    'ignores late old session creation %s after identity changes',
    async (outcome) => {
      const pending = deferred<Response>();
      fetchMock.mockReturnValueOnce(pending.promise);
      fixture = TestBed.createComponent(RecipeConversationPageComponent);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      source.ownerId = 2;
      user.set({
        id: 2,
        display_name: 'Next',
        issuer: 'https://idp.example/realms/test',
        subject: 'user-2',
      });
      fixture.detectChanges();
      await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
      const view = page.view();
      pending.resolve(
        outcome === 'success'
          ? response(
              { session_id: 'old-session', expires_at: '2026-10-23T00:00:00Z' },
              201,
            )
          : response({ kind: 'agent_unavailable' }, 503),
      );
      await fixture.whenStable();
      expect(page.view()).toBe(view);
      expect(page.view().turns).toEqual([]);
      expect(page.view().status).toBeNull();
      await submit(page);
      expect(
        new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get(
          'X-Application-User',
        ),
      ).toBe('https%3A%2F%2Fidp.example%2Frealms%2Ftest:user-2');
      expect(
        fetchMock.mock.calls.some(([url]) =>
          requestUrl(url).includes('old-session'),
        ),
      ).toBe(false);
    },
  );

  it('ignores a context read completing after logout before effects flush', async () => {
    const pending = deferred<ReturnType<typeof conversationRecipe>>();
    getRecipe.mockReturnValueOnce(pending.promise);
    fixture = TestBed.createComponent(RecipeConversationPageComponent);
    const page = fixture.componentInstance;
    user.set(null);
    pending.resolve(source);
    await pending.promise;
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(page.original()).toBeNull();
    fixture.detectChanges();
    expect(page.view().turns).toEqual([]);
    expect(page.view().composerDisabled).toBe(true);
  });

  it('reuses detached recipe context and capabilities on initial session retry', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ kind: 'agent_unavailable' }, 503),
    );
    const page = await open();
    const initialBody = fetchMock.mock.calls[0][1]?.body;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    source.name = 'Changed';
    source.ingredients[0].foodstuff.name = 'Changed';
    await page.performAction('new-session');
    expect(fetchMock.mock.calls[1][1]?.body).toBe(initialBody);
    expect(confirm).not.toHaveBeenCalled();
    expect(getRecipe).toHaveBeenCalledTimes(1);
    expect(page.original()?.headline).toBe('Original: Linsensuppe');
  });

  it('confirms leave and replacement, preserving protection on failure and clearing it after successful creation', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const page = await open();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(page.canLeave()).toBe(true);
    expect(add.mock.calls.some(([name]) => name === 'beforeunload')).toBe(
      false,
    );
    fetchMock.mockResolvedValueOnce(response({ kind: 'unknown' }, 404));
    await page.submit({ text: 'Verbessern', acknowledge: vi.fn() });
    expect(page.canLeave()).toBe(false);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const requests = fetchMock.mock.calls.length;
    await page.performAction('new-session');
    expect(fetchMock).toHaveBeenCalledTimes(requests);
    confirm.mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(
      response({ kind: 'agent_unavailable' }, 503),
    );
    await page.performAction('new-session');
    confirm.mockReturnValue(false);
    expect(page.canLeave()).toBe(false);
    confirm.mockReturnValue(true);
    await page.performAction('new-session');
    confirm.mockClear();
    expect(page.canLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(remove.mock.calls.some(([name]) => name === 'beforeunload')).toBe(
      true,
    );
    const creations = fetchMock.mock.calls.filter(([url]) => url === createUrl);
    expect(creations).toHaveLength(3);
    for (const [, request] of creations)
      expect(request?.body).toBe(creations[0][1]?.body);
  });

  it('allows logout to discard a started chat without confirmation', async () => {
    const page = await open();
    await submit(page);
    user.set(null);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(page.canLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['historical', 'missing', 'mismatched', 'non-owner'] as const)(
    'does not initialize an unavailable %s recipe',
    async (mode) => {
      if (mode === 'historical') source.state = 'historical';
      else if (mode === 'non-owner') source.ownerId = 2;
      else if (mode === 'mismatched')
        getRecipe.mockResolvedValue({
          ...source,
          recipeVersionId: 'another-version',
        });
      else if (mode === 'missing')
        getRecipe.mockRejectedValue(new HttpErrorResponse({ status: 404 }));
      const page = await open();
      expect(page.phase()).toBe('unavailable');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        fixture.debugElement.query(By.directive(ChatUiComponent)),
      ).toBeNull();
    },
  );

  it('offers a retry for source failures and starts no partial session', async () => {
    getRecipe.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    const page = await open();
    expect(page.phase()).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Erneut versuchen',
    );
    await page.load();
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    expect(page.phase()).toBe('ready');
    expect(getRecipe).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('blocks submission while context, session creation or initial observation is pending', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    fixture = TestBed.createComponent(RecipeConversationPageComponent);
    const page = fixture.componentInstance;
    await page.submit({ text: 'Zu fr?h', acknowledge: vi.fn() });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await page.submit({ text: 'Noch zu fr?h', acknowledge: vi.fn() });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const observation = deferred<Response>();
    fetchMock.mockReturnValueOnce(observation.promise);
    pending.resolve(
      response(
        { session_id: 'session-1', expires_at: '2026-10-23T00:00:00Z' },
        201,
      ),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await page.submit({ text: 'No snapshot yet', acknowledge: vi.fn() });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(page.view().composerDisabled).toBe(true);
  });

  it.each(['route', 'user', 'destroy'] as const)(
    'aborts observation and suppresses late admission after %s',
    async (boundary) => {
      const page = await open();
      await submit(page);
      const pending = deferred<Response>();
      fetchMock.mockReturnValueOnce(pending.promise);
      const acknowledge = vi.fn();
      const operation = page.submit({ text: 'Alt', acknowledge });
      const oldStream = streams[0];
      if (boundary === 'destroy') fixture.destroy();
      else if (boundary === 'user') user.set(null);
      else {
        const next = {
          ...conversationRecipe(),
          recipeVersionId: 'next',
          name: 'Neue Version',
        };
        getRecipe.mockResolvedValueOnce(next);
        params.next(
          convertToParamMap({
            lineageId: next.recipeLineageId,
            recipeVersionId: next.recipeVersionId,
          }),
        );
      }
      if (boundary !== 'destroy') fixture.detectChanges();
      await vi.waitFor(() => expect(oldStream.signal?.aborted).toBe(true));
      if (boundary === 'route') {
        await vi.waitFor(() =>
          expect(page.view().composerDisabled).toBe(false),
        );
        expect(page.original()?.headline).toBe('Original: Neue Version');
      }
      const view = page.view();
      pending.resolve(response({ kind: 'accepted' }, 202));
      await operation;
      expect(acknowledge).not.toHaveBeenCalled();
      expect(page.view()).toBe(view);
      if (boundary !== 'destroy') expect(page.view().turns).toEqual([]);
      if (boundary === 'user') expect(page.original()).toBeNull();
    },
  );

  it('suppresses late observation responses after leaving and starts a fresh session on revisit', async () => {
    const pending = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(
        response(
          { session_id: 'session-1', expires_at: '2026-10-23T00:00:00Z' },
          201,
        ),
      )
      .mockReturnValueOnce(pending.promise);
    fixture = TestBed.createComponent(RecipeConversationPageComponent);
    const page = fixture.componentInstance;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fixture.destroy();
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
    const view = page.view();
    const fresh = await open();
    pending.resolve(
      new Response(
        `data: ${JSON.stringify({ kind: 'snapshot', snapshot: snapshot() })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    await fixture.whenStable();
    expect(page.view()).toBe(view);
    expect(fresh.view().turns).toEqual([]);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === createUrl),
    ).toHaveLength(2);
  });

  it('suppresses late session creation after leaving', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    fixture = TestBed.createComponent(RecipeConversationPageComponent);
    const page = fixture.componentInstance;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fixture.destroy();
    const oldView = page.view();
    const fresh = await open();
    pending.resolve(
      response(
        { session_id: 'old-session', expires_at: '2026-10-23T00:00:00Z' },
        201,
      ),
    );
    await fixture.whenStable();
    expect(page.view()).toBe(oldView);
    expect(fresh.view().turns).toEqual([]);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        requestUrl(url).includes('old-session'),
      ),
    ).toBe(false);
  });

  it('suppresses late context loads and refreshes the recipe on revisit', async () => {
    const pending = deferred<ReturnType<typeof conversationRecipe>>();
    getRecipe.mockReturnValueOnce(pending.promise);
    fixture = TestBed.createComponent(RecipeConversationPageComponent);
    const old = fixture.componentInstance;
    fixture.destroy();
    source.name = 'Fresh recipe';
    const page = await open();
    pending.resolve(conversationRecipe());
    await fixture.whenStable();
    expect(old.original()).toBeNull();
    expect(page.original()?.headline).toBe('Original: Fresh recipe');
    expect(TestBed.inject(PageHeaderService).headline()).toBe('Fresh recipe');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
