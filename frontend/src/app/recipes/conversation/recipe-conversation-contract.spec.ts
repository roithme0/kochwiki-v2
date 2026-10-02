import { JSON_ARTIFACT_CAPABILITY } from '@roithme0/chat-ui/ui';
import { FOODSTUFF_ARTIFACT_CAPABILITY } from '../../foodstuffs/presentation/foodstuff-artifact';
import { RECIPE_ARTIFACT_CAPABILITY, isRecipePresentation } from '../presentation/recipe-artifact';
import { mapConversationArtifact, mapSessionInput, recipeArtifact } from './recipe-conversation-contract';
import { conversationProposal, conversationRecipe } from './recipe-conversation.fixtures';

describe('Recipe conversation contract', () => {
  it('captures the enriched recipe with inline foodstuffs as detached generic context', () => {
    const source = conversationRecipe();
    const input = mapSessionInput(source);
    expect(input).toEqual({ context: { source }, artifactCapabilities: [JSON_ARTIFACT_CAPABILITY, FOODSTUFF_ARTIFACT_CAPABILITY, RECIPE_ARTIFACT_CAPABILITY] });
    expect(input.context.source).not.toBe(source);
    expect(input.context.source.ingredients[0].foodstuff).not.toBe(source.ingredients[0].foodstuff);
    expect(input.context.source.recipeVersionId).toBe(source.recipeVersionId);
    expect(input.context.source.ingredients[0].foodstuff.id).toBe(1);
    source.steps[0].description = 'Changed';
    source.ingredients[0].foodstuff.name = 'Changed';
    expect(input.context.source.steps[0].description).toBe('Linsen kochen.');
    expect(input.context.source.ingredients[0].foodstuff.name).toBe('Linsen');
  });

  it('preserves explicit JSON presentation instead of treating it as a recipe proposal', () => {
    const artifact = mapConversationArtifact({ ...conversationProposal(), type: 'json', payload: {
      title: 'Foodstuff', payload: { value: { name: 'Linsen', unit: 'G' } },
    } });
    expect(artifact).toEqual({ kind: 'artifact', id: conversationProposal().artifact_id,
      type: 'json', headline: 'Foodstuff', payload: { value: { name: 'Linsen', unit: 'G' } } });
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
    const proposal = mapConversationArtifact(conversationProposal());
    expect(proposal.type).toBe('kochwiki-recipe');
    expect(proposal.headline).toBe('Neue Linsensuppe');
  });

  it.each([null, {}, { title: 'Bad', payload: {} },
    { title: 'Bad', payload: { ...conversationRecipe(), servings: 0 } },
    { title: 'Bad', payload: { ...conversationRecipe(), kcal: Infinity } },
    { title: 'Bad', payload: { ...conversationRecipe(), ingredients: [null] } },
    { title: 'Bad', payload: { ...conversationRecipe(), steps: [{}] } },
  ])('contains malformed artifacts locally: %j', payload => {
    expect(mapConversationArtifact({ ...conversationProposal(), payload: payload as ReturnType<typeof conversationProposal>['payload'] }).type).toBe('kochwiki-unsupported');
  });

  it('does not treat an unknown artifact type as a recipe', () => {
    expect(mapConversationArtifact({ ...conversationProposal(), type: 'other' }).type).toBe('kochwiki-unsupported');
  });
});
