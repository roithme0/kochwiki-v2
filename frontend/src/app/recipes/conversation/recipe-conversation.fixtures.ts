import type { RecipeVersionOut } from '../../core/api/generated';
import type { RecipeSessionArtifact } from './recipe-conversation-contract';
import type { FoodstuffOut } from '../../core/api/generated';
import { recipeArtifact } from './recipe-conversation-contract';
import { FoodstuffUnit } from '../../foodstuffs/models/foodstuff-unit';

export function conversationFoodstuff(): FoodstuffOut {
  return {
    id: 1,
    name: 'Linsen',
    brand: null,
    unit: FoodstuffUnit.Gram,
    imageId: null,
    unitVerbose: 'g',
    kcal: 120,
    carbs: 20,
    protein: 8,
    fat: null,
    recipeVersionIds: [],
  };
}

export function conversationRecipe(): RecipeVersionOut {
  return {
    imageId: null,
    imageDimensions: null,
    ownerId: 1,
    recipeLineageId: '00000000-0000-4000-8000-000000000001',
    recipeVersionId: '00000000-0000-4000-8000-000000000002',
    state: 'active',
    createdAt: '2026-09-27T00:00:00Z',
    lastModified: '2026-09-27T00:00:00Z',
    name: 'Linsensuppe',
    servings: 2,
    preptime: 30,
    kcal: { status: 'exact' as const, value: 120 },
    carbs: { status: 'exact' as const, value: 20 },
    protein: { status: 'exact' as const, value: 8 },
    fat: { status: 'unknown' as const, value: null },
    ingredients: [
      {
        id: 1,
        index: 1,
        amount: 100,
        foodstuff: conversationFoodstuff(),
        recipeVersionId: 'version',
      },
    ],
    steps: [
      {
        id: 1,
        index: 1,
        description: 'Linsen kochen.',
        recipeVersionId: 'version',
      },
    ],
  };
}

export const proposalId = '00000000-0000-4000-8000-000000000003';

export function conversationProposal(): RecipeSessionArtifact {
  return {
    artifact_id: 'proposal-1',
    type: 'kochwiki-recipe',
    created_at: '2026-09-27T00:00:00Z',
    run_id: 'turn-1',
    content: {
      title: 'Neue Linsensuppe',
      metadata: { proposalId },
      payload: recipeArtifact('presentation', 'Recipe', conversationRecipe())
        .payload as RecipeSessionArtifact['content']['payload'],
    },
  };
}
