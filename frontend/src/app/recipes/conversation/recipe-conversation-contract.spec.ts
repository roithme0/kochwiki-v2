import { isRecipePresentation, mapProposalArtifact, mapSessionInput, recipeArtifact } from './recipe-conversation-contract';
import { conversationFoodstuff, conversationProposal, conversationRecipe } from './recipe-conversation.fixtures';

describe('Recipe conversation contract', () => {
  it('maps the version UUID and every catalog item without persistence metadata or lost nulls', () => {
    const source = conversationRecipe();
    source.originName = 'Familie';
    source.originUrl = 'https://example.org/rezept';
    const catalog = Array.from({ length: 101 }, (_, index) => ({ ...conversationFoodstuff(), id: index + 1 }));
    const input = mapSessionInput(source, catalog);
    expect(input.source).toEqual({ external_reference: source.recipeVersionId, recipe: {
      name: 'Linsensuppe', servings: 2, preparation_time: 30, origin_name: 'Familie', origin_url: 'https://example.org/rezept',
      ingredients: [{ index: 1, amount: 100, foodstuff_reference: 1 }],
      steps: [{ index: 1, description: 'Linsen kochen.' }],
    } });
    expect(input.foodstuffs).toHaveLength(101);
    expect(input.foodstuffs[0]).toEqual({ external_reference: 1, name: 'Linsen', brand: null,
      unit: 'G', unit_verbose: 'g', kcal: 120, carbs: 20, protein: 8, fat: null });
    expect(mapSessionInput(conversationRecipe(), []).source.recipe.origin_name).toBeNull();
    expect(mapSessionInput(conversationRecipe(), []).source.recipe.origin_url).toBeNull();
    source.steps[0].description = 'Changed';
    catalog[0].name = 'Changed';
    expect(input.source.recipe.steps[0].description).toBe('Linsen kochen.');
    expect(input.foodstuffs[0].name).toBe('Linsen');
  });

  it('uses enriched nutrition unchanged and creates detached read-only artifact data', () => {
    const source = conversationRecipe();
    source.kcal = 987;
    const artifact = recipeArtifact('original', 'Original', source);
    source.ingredients[0].foodstuff.name = 'Changed';
    expect(isRecipePresentation(artifact.payload)).toBe(true);
    if (!isRecipePresentation(artifact.payload)) throw new Error('Invalid fixture');
    expect(artifact.payload.kcal).toBe(987);
    expect(artifact.payload.ingredients[0].foodstuff.name).toBe('Linsen');
    const proposal = mapProposalArtifact(conversationProposal());
    expect(proposal.type).toBe('kochwiki-recipe');
    expect(proposal.headline).toBe('Vorschlag: Neue Linsensuppe');
  });

  it.each([null, {}, { base: { kind: 'source' }, name: 'Bad', recipe: {} },
    { base: { kind: 'unknown' }, name: 'Bad', recipe: conversationRecipe() },
    { base: { kind: 'proposal', proposal_id: '' }, name: 'Bad', recipe: conversationRecipe() },
    { base: { kind: 'source' }, name: 'Bad', recipe: { ...conversationRecipe(), servings: 0 } },
    { base: { kind: 'source' }, name: 'Bad', recipe: { ...conversationRecipe(), kcal: Infinity } },
    { base: { kind: 'source' }, name: 'Bad', recipe: { ...conversationRecipe(), ingredients: [null] } },
    { base: { kind: 'source' }, name: 'Bad', recipe: { ...conversationRecipe(), steps: [{}] } },
  ])('contains malformed artifacts locally: %j', payload => {
    expect(mapProposalArtifact({ ...conversationProposal(), payload: payload as ReturnType<typeof conversationProposal>['payload'] }).type)
      .toBe('kochwiki-unsupported');
  });

  it('does not treat an unknown artifact type as a recipe', () => {
    expect(mapProposalArtifact({ ...conversationProposal(), type: 'other' }).type).toBe('kochwiki-unsupported');
  });
});
