import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { backendUrl } from '../../../core/constants/api';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { By } from '@angular/platform-browser';
import { ChatUiComponent, JSON_ARTIFACT_CAPABILITY } from '@roithme0/chat-ui/ui';
import { FOODSTUFF_ARTIFACT_CAPABILITY } from '../../../foodstuffs/presentation/foodstuff-artifact';
import { RECIPE_ARTIFACT_CAPABILITY } from '../../presentation/recipe-artifact';
import { NUTRITION_ARTIFACT_CAPABILITY } from '../../../core/presentation/nutrition-artifact';
import { FoodstuffPresentationComponent } from '../../../foodstuffs/components/foodstuff-presentation/foodstuff-presentation.component';
import { NutritionCardComponent } from '../../../core/components/nutrition-card/nutrition-card.component';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { ActiveUserService } from '../../../core/services/active-user.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { mapConversationArtifact } from '../../conversation/recipe-conversation-contract';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipePresentationComponent } from '../../components/recipe-presentation/recipe-presentation.component';
import { conversationProposal, conversationRecipe, proposalId } from '../../conversation/recipe-conversation.fixtures';
import { RecipeConversationPageComponent } from './recipe-conversation-page.component';

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

@Component({ template: '' })
class EmptyPage {}

describe('Recipe conversation page through published controller and HTTP transport', () => {
  let fixture: ComponentFixture<RecipeConversationPageComponent>;
  let source: ReturnType<typeof conversationRecipe>;
  const save = vi.fn<RecipeBackendService['saveRecipeProposal']>();
  const notify = vi.fn();
  const dismiss = vi.fn();
  const snackbar = vi.fn<SnackBarService['open']>();
  const getRecipe = vi.fn<RecipeBackendService['getRecipeVersion']>();
  const fetchMock = vi.fn<typeof fetch>();
  const user = signal<{ id: number; username: string } | null>({ id: 1, username: 'Test' });
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    vi.resetAllMocks();
    snackbar.mockReturnValue({ dismiss });
    save.mockResolvedValue({ ...conversationRecipe(), state: 'draft', recipeVersionId: 'saved' });
    user.set({ id: 1, username: 'Test' });
    source = conversationRecipe();
    params = new BehaviorSubject(convertToParamMap({ lineageId: source.recipeLineageId, recipeVersionId: source.recipeVersionId }));
    getRecipe.mockResolvedValue(source);
    fetchMock.mockImplementation(async () => response({ session_id: 'session-1', expires_at: 'later' }));
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      imports: [RecipeConversationPageComponent],
      providers: [provideRouter([{ path: '**', component: EmptyPage }]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: RecipeBackendService, useValue: { getRecipeVersion: getRecipe, saveRecipeProposal: save, notifyRecipesChanged: notify } },
        { provide: SnackBarService, useValue: { open: snackbar } },
        { provide: ActiveUserService, useValue: { activeUser: user } }],
    });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
  });

  afterEach(() => { fixture?.destroy(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function open(): Promise<RecipeConversationPageComponent> {
    fixture = TestBed.createComponent(RecipeConversationPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.view().status?.kind).not.toBe('loading'));
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  function turn(): Response {
    return response({ kind: 'completed', turn_id: 'turn-1',
      message: { role: 'assistant', text: 'Ein Vorschlag', turn_id: 'turn-1' },
      artifacts: [conversationProposal(), { ...conversationProposal(), artifact_id: 'bad', payload: {} }],
    });
  }

  it('renders explicitly presented MCP foodstuff data with name/brand headers and no writes or enrichment fetches', async () => {
    const page = await open();
    fetchMock.mockResolvedValueOnce(response({ role: 'user', text: 'Zeige die Linsen', turn_id: null }))
      .mockResolvedValueOnce(response({ kind: 'completed', turn_id: 'foodstuff-turn',
        message: { role: 'assistant', text: 'Die gefundenen Linsen', turn_id: 'foodstuff-turn' },
        artifacts: [{ ...conversationProposal(), artifact_id: 'foodstuff', type: 'kochwiki-foodstuff',
          payload: { title: 'Linsen', subtitle: 'Meine Marke',
            payload: { unit: 'G', kcal: 200, carbs: 12, protein: 8, fat: 4 } } }],
      }));
    await page.submit({ text: 'Zeige die Linsen', acknowledge: vi.fn() });
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.directive(FoodstuffPresentationComponent))).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Meine Marke');
    const cards = fixture.debugElement.queryAll(By.directive(NutritionCardComponent));
    expect(cards.map(card => (card.componentInstance as NutritionCardComponent).basis())).toContain('pro 100 g');
    expect(getRecipe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(save).not.toHaveBeenCalled();
  });

  async function submit(page: RecipeConversationPageComponent): Promise<void> {
    fetchMock.mockResolvedValueOnce(response({ role: 'user', text: 'Mehr Gemüse', turn_id: null })).mockResolvedValueOnce(turn());
    await page.submit({ text: 'Mehr Gemüse', acknowledge: vi.fn() });
  }

  it.each([
    { title: 'Linsen', subtitle: 'Meine Marke', basis: 'per-100-g', label: 'pro 100 g' },
    { title: 'Linsensuppe', basis: 'per-serving', label: 'pro Portion' },
    { title: 'Linsensuppe', basis: 'whole-recipe', label: 'gesamtes Rezept' },
  ])('renders dedicated nutrition for $title with $basis without full item or save actions', async item => {
    const page = await open();
    const payload = { basis: item.basis, kcal: 200, carbs: null, protein: 8, fat: 0 };
    fetchMock.mockResolvedValueOnce(response({ role: 'user', text: 'Nährwerte?', turn_id: null }))
      .mockResolvedValueOnce(response({ kind: 'completed', turn_id: 'nutrition-turn',
        message: { role: 'assistant', text: 'Hier sind die Nährwerte.', turn_id: 'nutrition-turn' },
        artifacts: [{ ...conversationProposal(), type: 'kochwiki-nutrition',
          payload: { title: item.title, subtitle: item.subtitle, payload } }],
      }));
    await page.submit({ text: 'Nährwerte?', acknowledge: vi.fn() });
    fixture.detectChanges();
    const cards = fixture.debugElement.queryAll(By.directive(NutritionCardComponent));
    expect(cards).toHaveLength(2);
    const card = cards[1].componentInstance as NutritionCardComponent;
    expect(card.basis()).toBe(item.label);
    expect(card.nutrition()).toEqual(payload);
    expect(fixture.nativeElement.textContent).toContain(item.title);
    if (item.subtitle) expect(fixture.nativeElement.textContent).toContain(item.subtitle);
    expect(fixture.debugElement.queryAll(By.directive(FoodstuffPresentationComponent))).toHaveLength(0);
    expect(fixture.debugElement.queryAll(By.directive(RecipePresentationComponent))).toHaveLength(1);
    expect(fixture.nativeElement.textContent).not.toContain('Als Entwurf speichern');
    expect(getRecipe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(save).not.toHaveBeenCalled();
  });

  it('renders a recipe with temporary ingredients and preparation time without saving or fetching', async () => {
    const page = await open();
    const payload = { servings: 2, preptime: 25, kcal: null, carbs: null, protein: null, fat: null,
      ingredients: [{ index: 1, amount: 100, foodstuff: { name: 'Neue Zutat', unitVerbose: 'g',
        kcal: null, carbs: null, protein: null, fat: null } }],
      steps: [{ index: 1, description: 'Neue Zutat schneiden.' }] };
    fetchMock.mockResolvedValueOnce(response({ role: 'user', text: 'Zeige das Rezept', turn_id: null }))
      .mockResolvedValueOnce(response({ kind: 'completed', turn_id: 'recipe-turn',
        message: { role: 'assistant', text: 'Hier ist das Rezept.', turn_id: 'recipe-turn' },
        artifacts: [{ ...conversationProposal(), artifact_id: 'recipe', type: 'kochwiki-recipe',
          payload: { title: 'Neues Rezept', payload } }],
      }));
    await page.submit({ text: 'Zeige das Rezept', acknowledge: vi.fn() });
    fixture.detectChanges();
    const recipes = fixture.debugElement.queryAll(By.directive(RecipePresentationComponent));
    expect(recipes.some(recipe => (recipe.componentInstance as RecipePresentationComponent).recipe()
      .ingredients[0].foodstuff.name === 'Neue Zutat')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('25 min');
    expect(fixture.nativeElement.textContent).toContain('Neues Rezept');
    expect(fixture.nativeElement.textContent).not.toContain('Als Entwurf speichern');
    expect(getRecipe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(save).not.toHaveBeenCalled();
  });

  it('renders an explicitly selected JSON artifact without recipe save actions', async () => {
    const page = await open();
    fetchMock.mockResolvedValueOnce(response({ role: 'user', text: 'Show the foodstuff', turn_id: null }))
      .mockResolvedValueOnce(response({ kind: 'completed', turn_id: 'turn-json',
        message: { role: 'assistant', text: 'Here is the foodstuff.', turn_id: 'turn-json' },
        artifacts: [{ ...conversationProposal(), type: 'json', turn_id: 'turn-json',
          payload: { title: 'Foodstuff', payload: { value: { name: 'Linsen', unit: 'G' } } } }],
      }));
    await page.submit({ text: 'Show the foodstuff', acknowledge: vi.fn() });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('pre')?.textContent).toContain('"name": "Linsen"');
    expect(fixture.nativeElement.textContent).not.toContain('Als Entwurf speichern');
    expect(save).not.toHaveBeenCalled();
  });

  it.each(['active', 'draft'] as const)('saves a stored proposal from %s with no overlapping requests', async state => {
    source.state = state;
    const page = await open();
    await submit(page);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.match(/Als Entwurf speichern/g)).toHaveLength(1);
    const payload = mapConversationArtifact(conversationProposal()).metadata;
    const pending = deferred<ReturnType<typeof conversationRecipe>>();
    save.mockReturnValueOnce(pending.promise);
    const operation = page.saveProposal(payload);
    await page.saveProposal(payload);
    await page.saveProposal(mapConversationArtifact({ ...conversationProposal(), artifact_id: 'another' }).metadata);
    await page.saveProposal(page.original()?.metadata);
    expect(save).toHaveBeenCalledTimes(1);
    expect(page.view().composerDisabled).toBe(false);
    expect(save).toHaveBeenCalledWith(proposalId);
    pending.resolve({ ...conversationRecipe(), recipeVersionId: 'returned', state: 'draft' });
    await operation;
    expect(notify).toHaveBeenCalledTimes(1);
    expect(snackbar).toHaveBeenCalledWith('Entwurf gespeichert', expect.objectContaining({ label: 'Entwurf öffnen' }));
    expect(page.savePending()).toBe(false);
    await page.saveProposal(payload);
    expect(save).toHaveBeenCalledTimes(2);
    expect(getRecipe).toHaveBeenCalledTimes(1);
  });

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

  it.each([[404, 'neuen Vorschlag'], [409, 'Konflikts']] as const)(
    'reports a definite HTTP %s failure without suggesting the draft may have been created', async (status, message) => {
      const page = await open();
      save.mockRejectedValueOnce(new HttpErrorResponse({ status }));
      await page.saveProposal({ proposalId });
      expect(snackbar.mock.calls[0][0]).toContain(message);
      expect(snackbar.mock.calls[0][0]).not.toContain('Möglicherweise');
      expect(notify).not.toHaveBeenCalled();
      expect(page.savePending()).toBe(false);
    });

  it('saves the proposal advertised by the artifact button, without constructing recipe data', async () => {
    const page = await open();
    await submit(page);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button.proposal-save') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith(proposalId));
    expect(save.mock.calls[0]).toEqual([proposalId]);
    await vi.waitFor(() => expect(page.savePending()).toBe(false));
  });

  it('treats a malformed successful draft response as unconfirmed without retry or open action', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.overrideProvider(RecipeBackendService, { useFactory: () => {
      const service = new RecipeBackendService();
      service.getRecipeVersion = getRecipe;
      service.notifyRecipesChanged = notify;
      return service;
    } });
    const page = await open();
    await submit(page);
    const original = page.original();
    const content = page.view().content;
    const operation = page.saveProposal(mapConversationArtifact(conversationProposal()).metadata);
    const http = TestBed.inject(HttpTestingController);
    const url = `${backendUrl}/recipe-proposals/${proposalId}/save`;
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({ recipeLineageId: source.recipeLineageId, recipeVersionId: 'invalid' }, { status: 201, statusText: 'Created' });
    await operation;
    expect(notify).not.toHaveBeenCalled();
    expect(snackbar).toHaveBeenCalledTimes(1);
    expect(snackbar).toHaveBeenCalledWith('Speichern konnte nicht bestätigt werden. Möglicherweise wurde der Entwurf bereits erstellt.');
    expect(page.original()).toBe(original);
    expect(page.view().content).toBe(content);
    expect(page.savePending()).toBe(false);
    http.expectNone(url);
    http.verify();
  });

  it.each(['destroy', 'route', 'user'] as const)('suppresses deferred save feedback after %s', async boundary => {
    const page = await open();
    const pending = deferred<ReturnType<typeof conversationRecipe>>();
    save.mockReturnValueOnce(pending.promise);
    const operation = page.saveProposal(mapConversationArtifact(conversationProposal()).metadata);
    if (boundary === 'destroy') fixture.destroy();
    if (boundary === 'user') user.set(null);
    if (boundary === 'route') {
      const next = { ...conversationRecipe(), recipeVersionId: 'next' };
      getRecipe.mockResolvedValueOnce(next);
      params.next(convertToParamMap({ lineageId: next.recipeLineageId, recipeVersionId: next.recipeVersionId }));
    }
    pending.resolve(conversationRecipe());
    await operation;
    expect(snackbar).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('keeps the outstanding lock across successful replacement and suppresses old feedback', async () => {
    const page = await open();
    await submit(page);
    const payload = mapConversationArtifact(conversationProposal()).metadata;
    const pending = deferred<ReturnType<typeof conversationRecipe>>();
    save.mockReturnValueOnce(pending.promise);
    const operation = page.saveProposal(payload);
    fetchMock.mockResolvedValueOnce(response({ kind: 'expired', detail: 'Session expired' }, 410));
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
    fetchMock.mockResolvedValueOnce(response({ kind: 'expired', detail: 'Session expired' }, 410));
    await page.submit({ text: 'More', acknowledge: vi.fn() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(response({ kind: 'agent_unavailable', detail: 'Agent unavailable' }, 503));
    await page.performAction('new-session');
    await page.saveProposal(payload);
    expect(save).toHaveBeenCalledTimes(1);
    pending.resolve(conversationRecipe());
    await operation;
    expect(snackbar).toHaveBeenCalledWith('Entwurf gespeichert', expect.any(Object));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(page.canLeave()).toBe(false);
  });

  it('retains save feedback and leave protection after failed replacement, then dismisses it on successful replacement', async () => {
    const page = await open();
    await submit(page);
    await page.saveProposal(mapConversationArtifact(conversationProposal()).metadata);
    fetchMock.mockResolvedValueOnce(response({ kind: 'expired', detail: 'Session expired' }, 410));
    await page.submit({ text: 'More', acknowledge: vi.fn() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(response({ kind: 'agent_unavailable', detail: 'Agent unavailable' }, 503));
    await page.performAction('new-session');
    expect(dismiss).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(page.canLeave()).toBe(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await page.performAction('new-session');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('initializes only, then submits and refines in the same session without recipe writes', async () => {
    const page = await open();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getRecipe).toHaveBeenCalledWith(source.recipeLineageId, source.recipeVersionId);
    expect(fetchMock.mock.calls[0][0]).toBe('/ai/api/v1/agents/kochwiki/sessions');
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(Object.keys(request.input)).toEqual(['context', 'artifactCapabilities']);
    expect(request.input.artifactCapabilities).toEqual([JSON_ARTIFACT_CAPABILITY, FOODSTUFF_ARTIFACT_CAPABILITY, RECIPE_ARTIFACT_CAPABILITY, NUTRITION_ARTIFACT_CAPABILITY]);
    expect(request.input.context.source.recipeVersionId).toBe(source.recipeVersionId);
    expect(request.input.context.source.ingredients[0].foodstuff).toEqual(source.ingredients[0].foodstuff);
    expect(request.input.context).not.toHaveProperty('foodstuffs');
    const header = TestBed.inject(PageHeaderService);
    expect(header.headline()).toBe(source.name);
    expect(header.subheader()).toBe('Rezept verbessern');
    expect(header.back()).toBe(`/recipes/${source.recipeLineageId}/versions/${source.recipeVersionId}`);
    const original = page.original();
    await submit(page);
    await submit(page);
    fixture.detectChanges();
    expect(page.original()).toBe(original);
    expect(page.view().status).toBeNull();
    expect(page.view().content.filter(item => item.kind === 'text')).toHaveLength(4);
    expect(fixture.debugElement.queryAll(By.directive(RecipePresentationComponent))).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('Inhalt nicht darstellbar');
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/ai/api/v1/agents/kochwiki/sessions',
      '/ai/api/v1/agents/kochwiki/sessions/session-1/messages', '/ai/api/v1/agents/kochwiki/sessions/session-1/turns',
      '/ai/api/v1/agents/kochwiki/sessions/session-1/messages', '/ai/api/v1/agents/kochwiki/sessions/session-1/turns',
    ]);
  });

  it('reuses detached snapshots on initial session retry', async () => {
    fetchMock.mockResolvedValueOnce(response({ kind: 'agent_unavailable', detail: 'Agent unavailable' }, 503));
    const page = await open();
    const initialBody = fetchMock.mock.calls[0][1]?.body;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    source.name = 'Changed'; source.ingredients[0].foodstuff.name = 'Changed';
    await page.performAction('new-session');
    expect(fetchMock.mock.calls[1][1]?.body).toBe(initialBody);
    expect(confirm).not.toHaveBeenCalled();
    expect(getRecipe).toHaveBeenCalledTimes(1);
    expect(page.original()?.headline).toBe('Original: Linsensuppe');
  });

  it('confirms leave and replacement, preserving protection after failure and clearing it after success', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const page = await open();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(page.canLeave()).toBe(true);
    expect(add.mock.calls.some(call => call[0] === 'beforeunload')).toBe(false);
    fetchMock.mockResolvedValueOnce(response({ kind: 'expired', detail: 'Session expired' }, 410));
    await page.submit({ text: 'Verbessern', acknowledge: vi.fn() });
    expect(page.canLeave()).toBe(false);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await page.performAction('new-session');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    confirm.mockReturnValue(true);
    expect(page.canLeave()).toBe(true);
    fetchMock.mockResolvedValueOnce(response({ kind: 'agent_unavailable', detail: 'Agent unavailable' }, 503));
    await page.performAction('new-session');
    confirm.mockReturnValue(false);
    expect(page.canLeave()).toBe(false);
    confirm.mockReturnValue(true);
    await page.performAction('new-session');
    confirm.mockClear();
    expect(page.canLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(remove.mock.calls.some(call => call[0] === 'beforeunload')).toBe(true);
    expect(fetchMock.mock.calls[2][1]?.body).toBe(fetchMock.mock.calls[0][1]?.body);
    expect(fetchMock.mock.calls[3][1]?.body).toBe(fetchMock.mock.calls[0][1]?.body);
  });

  it('allows user switching to discard a started chat without confirmation', async () => {
    const page = await open();
    await submit(page);
    user.set(null);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(page.canLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['historical', 'missing'] as const)('does not initialize an unavailable %s recipe', async mode => {
    if (mode === 'historical') source.state = 'historical';
    else getRecipe.mockRejectedValue(new HttpErrorResponse({ status: 404 }));
    const page = await open();
    expect(page.phase()).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fixture.debugElement.query(By.directive(ChatUiComponent))).toBeNull();
  });

  it('retries the recipe read after a failure without starting a partial session', async () => {
    getRecipe.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    const page = await open();
    expect(page.phase()).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
    await page.load();
    expect(page.phase()).toBe('ready');
    expect(getRecipe).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows a retry for non-missing source failures', async () => {
    getRecipe.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    const page = await open();
    expect(page.phase()).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Erneut versuchen');
  });

  it('keeps historical sources unavailable', async () => {
    source.state = 'historical';
    const page = await open();
    expect(page.phase()).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fixture.debugElement.query(By.directive(ChatUiComponent))).toBeNull();
  });

  it('blocks submission while data or session creation is pending', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    fixture = TestBed.createComponent(RecipeConversationPageComponent);
    const page = fixture.componentInstance;
    await page.submit({ text: 'Zu früh', acknowledge: vi.fn() });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await page.submit({ text: 'Noch zu früh', acknowledge: vi.fn() });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(response({ session_id: 'session-1', expires_at: 'later' }));
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
  });

  it('ignores an old controller after the routed source changes', async () => {
    const page = await open();
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const acknowledge = vi.fn();
    const operation = page.submit({ text: 'Alt', acknowledge });
    const next = { ...conversationRecipe(), recipeVersionId: '00000000-0000-4000-8000-000000000003', name: 'Neue Version' };
    getRecipe.mockResolvedValueOnce(next);
    params.next(convertToParamMap({ lineageId: next.recipeLineageId, recipeVersionId: next.recipeVersionId }));
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    fetchMock.mockResolvedValueOnce(turn());
    pending.resolve(response({ role: 'user', text: 'Alt', turn_id: null }));
    await operation;
    expect(acknowledge).not.toHaveBeenCalled();
    expect(page.view().content).toEqual([]);
    expect(page.original()?.headline).toBe('Original: Neue Version');
  });

  it('suppresses late turn results after leaving', async () => {
    const page = await open();
    const pending = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response({ role: 'user', text: 'Verbessern', turn_id: null })).mockReturnValueOnce(pending.promise);
    const acknowledge = vi.fn();
    const operation = page.submit({ text: 'Verbessern', acknowledge });
    await vi.waitFor(() => expect(acknowledge).toHaveBeenCalledTimes(1));
    fixture.destroy();
    const oldView = page.view();
    const fresh = await open();
    pending.resolve(turn());
    await operation;
    expect(page.view()).toBe(oldView);
    expect(fresh.view().content).toEqual([]);
    expect(fetchMock.mock.calls.filter(call => call[0] === '/ai/api/v1/agents/kochwiki/sessions')).toHaveLength(2);
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
    pending.resolve(response({ session_id: 'old-session', expires_at: 'later' }));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await fixture.whenStable();
    expect(page.view()).toBe(oldView);
    expect(fresh.view().content).toEqual([]);
  });

  it('suppresses late loads and starts with fresh data on revisiting', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('suppresses delayed acknowledgement, state publication, and focus after destruction', async () => {
    const page = await open();
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(turn());
    const acknowledge = vi.fn();
    const operation = page.submit({ text: 'Verbessern', acknowledge });
    const oldView = page.view();
    fixture.destroy();
    const header = TestBed.inject(PageHeaderService);
    expect(header.subheader()).toBe('');
    header.updateHeader(true, 'Andere Seite', '/recipes');
    pending.resolve(response({ role: 'user', text: 'Verbessern', turn_id: null }));
    await operation;
    expect(acknowledge).not.toHaveBeenCalled();
    expect(page.view()).toBe(oldView);
    expect(header.headline()).toBe('Andere Seite');
  });
});
