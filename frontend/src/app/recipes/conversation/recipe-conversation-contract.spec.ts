import { isRecipePresentation, mapProposalArtifact, mapSessionInput, recipeArtifact } from './recipe-conversation-contract';
import { conversationProposal, conversationRecipe } from './recipe-conversation.fixtures';

describe('Recipe conversation contract', () => {
  it('captures the enriched recipe with inline foodstuffs as detached generic context', () => {
    const source = conversationRecipe();
    source.originName = 'Familie';
    source.originUrl = 'https://example.org/rezept';
    const input = mapSessionInput(source);
    expect(input).toEqual({ context: { source } });
    expect(input.context.source).not.toBe(source);
    expect(input.context.source.ingredients[0].foodstuff).not.toBe(source.ingredients[0].foodstuff);
    expect(input.context.source.recipeVersionId).toBe(source.recipeVersionId);
    expect(input.context.source.ingredients[0].foodstuff.id).toBe(1);
    expect(mapSessionInput(conversationRecipe()).context.source.originName).toBeNull();
    expect(mapSessionInput(conversationRecipe()).context.source.originUrl).toBeNull();
    source.steps[0].description = 'Changed';
    source.ingredients[0].foodstuff.name = 'Changed';
    expect(input.context.source.steps[0].description).toBe('Linsen kochen.');
    expect(input.context.source.ingredients[0].foodstuff.name).toBe('Linsen');
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
