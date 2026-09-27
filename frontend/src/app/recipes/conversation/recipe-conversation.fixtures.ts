import { ApiArtifact } from '@roithme0/chat-ui/conversation';
import { Foodstuff } from '../../foodstuffs/models/foodstuff';
import { FoodstuffUnit } from '../../foodstuffs/models/foodstuff-unit';
import { RecipeVersion } from '../models/recipe';

export function conversationFoodstuff(): Foodstuff {
  return { id: 1, name: 'Linsen', brand: null, unit: FoodstuffUnit.Gram, unitVerbose: 'g',
    kcal: 120, carbs: 20, protein: 8, fat: null, recipeVersionIds: [] };
}

export function conversationRecipe(): RecipeVersion {
  return {
    recipeLineageId: '00000000-0000-4000-8000-000000000001',
    recipeVersionId: '00000000-0000-4000-8000-000000000002', state: 'active',
    createdAt: '2026-09-27T00:00:00Z', lastModified: '2026-09-27T00:00:00Z',
    name: 'Linsensuppe', servings: 2, preptime: 30, originName: null, originUrl: null,
    kcal: 120, carbs: 20, protein: 8, fat: null,
    ingredients: [{ id: 1, index: 1, amount: 100, foodstuff: conversationFoodstuff(), recipeVersionId: 'version' }],
    steps: [{ id: 1, index: 1, description: 'Linsen kochen.', recipeVersionId: 'version' }],
  };
}

export function conversationProposal(): ApiArtifact {
  const { servings, preptime, kcal, carbs, protein, fat, ingredients, steps } = conversationRecipe();
  return {
    artifact_id: 'proposal-1', type: 'recipe.proposal', created_at: '2026-09-27T00:00:00Z', order: 1, turn_id: 'turn-1',
    payload: { base: { kind: 'source' }, name: 'Neue Linsensuppe',
      recipe: { servings, preptime, kcal, carbs, protein, fat, ingredients, steps } },
  };
}
