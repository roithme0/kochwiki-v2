import { JSON_ARTIFACT_CAPABILITY } from '@roithme0/chat-ui/ui';
import { FOODSTUFF_ARTIFACT_CAPABILITY } from '../../foodstuffs/presentation/foodstuff-artifact';
import { NUTRITION_ARTIFACT_CAPABILITY } from '../../core/presentation/nutrition-artifact';
import {
  RECIPE_ARTIFACT_CAPABILITY,
  isRecipePresentation,
} from '../presentation/recipe-artifact';
import {
  mapConversationArtifact,
  mapSessionInput,
  recipeArtifact,
} from './recipe-conversation-contract';
import {
  conversationProposal,
  conversationRecipe,
} from './recipe-conversation.fixtures';

const validPayload = conversationProposal().content.payload;
if (
  validPayload === null ||
  typeof validPayload !== 'object' ||
  Array.isArray(validPayload)
)
  throw new Error('Expected recipe object');

describe('Recipe conversation contract', () => {
  it('advertises rendering capabilities without browser-supplied recipe context', () => {
    expect(mapSessionInput()).toEqual({
      artifact_capabilities: [
        JSON_ARTIFACT_CAPABILITY,
        FOODSTUFF_ARTIFACT_CAPABILITY,
        RECIPE_ARTIFACT_CAPABILITY,
        NUTRITION_ARTIFACT_CAPABILITY,
      ],
    });
  });

  it('preserves explicit JSON presentation instead of treating it as a recipe proposal', () => {
    const artifact = mapConversationArtifact({
      ...conversationProposal(),
      type: 'json',
      content: {
        title: 'Foodstuff',
        payload: { value: { name: 'Linsen', unit: 'G' } },
      },
    });
    expect(artifact).toEqual({
      kind: 'artifact',
      id: conversationProposal().artifact_id,
      type: 'json',
      headline: 'Foodstuff',
      payload: { value: { name: 'Linsen', unit: 'G' } },
    });
  });

  it('uses enriched nutrition unchanged and creates detached read-only artifact data', () => {
    const source = conversationRecipe();
    source.ingredients[0].foodstuff.imageId =
      '00000000-0000-4000-8000-000000000002';
    source.kcal = { status: 'exact' as const, value: 987 };
    const artifact = recipeArtifact('original', 'Original', source);
    source.ingredients[0].foodstuff.name = 'Changed';
    expect(isRecipePresentation(artifact.payload)).toBe(true);
    if (!isRecipePresentation(artifact.payload))
      throw new Error('Invalid fixture');
    expect(artifact.payload.kcal).toEqual({ status: 'exact', value: 987 });
    source.kcal.value = 1;
    expect(artifact.payload.kcal).toEqual({ status: 'exact', value: 987 });
    expect(artifact.payload.ingredients[0].foodstuff.name).toBe('Linsen');
    expect(artifact.payload.ingredients[0].foodstuff.imageId).toBe(
      source.ingredients[0].foodstuff.imageId,
    );
    source.ingredients[0].foodstuff.imageId = null;
    expect(artifact.payload.ingredients[0].foodstuff.imageId).not.toBeNull();
    const proposal = mapConversationArtifact(conversationProposal());
    expect(proposal.type).toBe('kochwiki-recipe');
    expect(proposal.headline).toBe('Neue Linsensuppe');
  });

  it.each([
    null,
    {},
    { ...validPayload, servings: 0 },
    { ...validPayload, kcal: Infinity },
    { ...validPayload, ingredients: [null] },
    { ...validPayload, steps: [{}] },
  ])('contains malformed artifacts locally: %j', (payload) => {
    expect(
      mapConversationArtifact({
        ...conversationProposal(),
        content: {
          title: 'Bad',
          payload,
        },
      }).type,
    ).toBe('kochwiki-unsupported');
  });

  it('does not treat an unknown artifact type as a recipe', () => {
    expect(
      mapConversationArtifact({ ...conversationProposal(), type: 'other' })
        .type,
    ).toBe('kochwiki-unsupported');
  });
});
