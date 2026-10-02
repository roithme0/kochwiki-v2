import type { RecipeVersionOut } from '../../core/api/generated';
import { ArtifactResponse } from '@roithme0/chat-ui/conversation';
import type { FoodstuffOut } from '../../core/api/generated';
import { recipeArtifact } from './recipe-conversation-contract';
import { FoodstuffUnit } from '../../foodstuffs/models/foodstuff-unit';


export function conversationFoodstuff(): FoodstuffOut {
  return { id: 1, name: 'Linsen', brand: null, unit: FoodstuffUnit.Gram, unitVerbose: 'g',
    kcal: 120, carbs: 20, protein: 8, fat: null, recipeVersionIds: [] };
}

export function conversationRecipe(): RecipeVersionOut {
  return {
    recipeLineageId: '00000000-0000-4000-8000-000000000001',
    recipeVersionId: '00000000-0000-4000-8000-000000000002', state: 'active',
    createdAt: '2026-09-27T00:00:00Z', lastModified: '2026-09-27T00:00:00Z',
    name: 'Linsensuppe', servings: 2, preptime: 30,
    kcal: 120, carbs: 20, protein: 8, fat: null,
    ingredients: [{ id: 1, index: 1, amount: 100, foodstuff: conversationFoodstuff(), recipeVersionId: 'version' }],
    steps: [{ id: 1, index: 1, description: 'Linsen kochen.', recipeVersionId: 'version' }],
  };
}

export const proposalId = '00000000-0000-4000-8000-000000000003';

export function conversationProposal(): ArtifactResponse {
  return {
    artifact_id: 'proposal-1', type: 'kochwiki-recipe', created_at: '2026-09-27T00:00:00Z', order: 1, turn_id: 'turn-1',
    payload: { title: 'Neue Linsensuppe', metadata: { proposalId },
      payload: recipeArtifact('presentation', 'Recipe', conversationRecipe()).payload },
  };
}
