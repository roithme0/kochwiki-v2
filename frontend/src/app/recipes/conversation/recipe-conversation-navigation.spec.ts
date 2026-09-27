import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { EMPTY } from 'rxjs';
import { ActiveUserService } from '../../core/services/active-user.service';
import { FoodstuffBackendService } from '../../foodstuffs/services/foodstuff-backend.service';
import { RecipeBackendService } from '../services/recipe-backend.service';
import { RecipeConversationPageComponent } from '../pages/recipe-conversation-page/recipe-conversation-page.component';
import { RecipePageComponent } from '../pages/recipe-page/recipe-page.component';
import { MacroChartComponent } from '../../core/components/macro-chart/macro-chart.component';
import { PageHeaderService } from '../../core/services/page-header.service';
import { SnackBarService } from '../../core/services/snack-bar.service';
import { mapProposalArtifact } from './recipe-conversation-contract';
import { conversationProposal, conversationRecipe } from './recipe-conversation.fixtures';
import { routes } from '../../app.routes';

describe('Version-specific conversation routing', () => {
  const source = conversationRecipe();
  const path = `/recipes/${source.recipeLineageId}/versions/${source.recipeVersionId}/improve`;
  const getRecipe = vi.fn<RecipeBackendService['getRecipeVersion']>();

  const snackbar = vi.fn<SnackBarService['open']>();
  beforeEach(() => {
    snackbar.mockReset().mockReturnValue({ dismiss: vi.fn() });
    getRecipe.mockReset().mockImplementation(async (_lineageId, versionId) => ({ ...conversationRecipe(), recipeVersionId: versionId }));
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const payload = String(url).endsWith('/messages') ? { kind: 'expired' } : { session_id: 'test', expires_at: 'later' };
      return new Response(JSON.stringify(payload), { status: String(url).endsWith('/messages') ? 410 : 200 });
    }));
    TestBed.configureTestingModule({ providers: [
      provideRouter(routes),
      { provide: ActiveUserService, useValue: { activeUser: signal({ id: 1, username: 'Test' }) } },
      { provide: SnackBarService, useValue: { open: snackbar } },
      { provide: RecipeBackendService, useValue: { getRecipeVersion: getRecipe, createRecipeDraft: async () => ({ ...conversationRecipe(), recipeVersionId: 'returned-draft', state: 'draft' }), notifyRecipesChanged: vi.fn(), recipesChanged$: EMPTY } },
      { provide: FoodstuffBackendService, useValue: { getAllFoodstuffs: async () => [] } },
    ] });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('opens the returned draft through leave confirmation and invalidates its action after leaving', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(path, RecipeConversationPageComponent);
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    await page.submit({ text: 'Improve', acknowledge: vi.fn() });
    await page.saveProposal(mapProposalArtifact(conversationProposal()).payload);
    const action = snackbar.mock.calls[0][1];
    if (!action) throw new Error('Missing action');
    const router = TestBed.inject(Router);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    action.run();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(router.url).toBe(path);
    expect(harness.routeDebugElement?.componentInstance).toBe(page);
    confirm.mockReturnValue(true);
    action.run();
    await vi.waitFor(() => expect(router.url).toBe(path.replace(source.recipeVersionId, 'returned-draft').replace('/improve', '')));
    const navigate = vi.spyOn(router, 'navigate');
    action.run();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('protects application navigation and parameter changes, then reopens with a fresh session', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(path, RecipeConversationPageComponent);
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    await page.submit({ text: 'Verbessern', acknowledge: vi.fn() });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const router = TestBed.inject(Router);
    expect(await router.navigateByUrl('/userSelection')).toBe(false);
    expect(router.url).toBe(path);
    expect(harness.routeDebugElement?.componentInstance).toBe(page);
    const nextPath = path.replace(source.recipeVersionId, '00000000-0000-4000-8000-000000000003');
    expect(await router.navigateByUrl(nextPath)).toBe(false);
    expect(getRecipe).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    expect(await router.navigateByUrl(nextPath)).toBe(true);
    await vi.waitFor(() => expect(getRecipe).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(page.view().composerDisabled).toBe(false));
    expect(page.original()?.id).toContain('00000000-0000-4000-8000-000000000003');
    expect(page.view().content).toEqual([]);
    await router.navigateByUrl('/userSelection');
    expect(TestBed.inject(PageHeaderService).subheader()).toBe('');
    const reopened = await harness.navigateByUrl(path, RecipeConversationPageComponent);
    expect(reopened).not.toBe(page);
    await vi.waitFor(() => expect(reopened.view().composerDisabled).toBe(false));
    expect(getRecipe).toHaveBeenCalledTimes(3);
  });

  it.each(['active', 'draft', 'historical'] as const)('exposes the appropriate action for %s recipes', async state => {
    const recipe = conversationRecipe();
    recipe.state = state;
    TestBed.overrideProvider(RecipeBackendService, { useValue: {
      getRecipeVersion: async () => recipe,
      recipesChanged$: EMPTY,
    } });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path.replace('/improve', ''), RecipePageComponent);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const action = (): HTMLAnchorElement | null => harness.routeNativeElement?.querySelector('a[aria-label="Rezept verbessern"]') ?? null;
    if (state === 'historical') expect(action()).toBeNull();
    else expect(action()?.getAttribute('href')).toBe(path);
  });
});
