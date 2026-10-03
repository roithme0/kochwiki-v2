import { mapConversationArtifact } from '../../recipes/conversation/recipe-conversation-contract';
import { conversationProposal } from '../../recipes/conversation/recipe-conversation.fixtures';
import { NUTRITION_ARTIFACT_CAPABILITY, isNutritionPresentation, nutritionBasisLabel } from './nutrition-artifact';

const values = { kcal: 0, carbs: null, protein: 12, fat: null };

describe('Nutrition artifact contract', () => {
  it.each(['per-100-g', 'per-100-ml', 'per-piece', 'per-serving', 'whole-recipe'] as const)(
    'preserves values and headers for %s independently of full item artifacts', basis => {
      const payload = { ...values, basis };
      const artifact = mapConversationArtifact({ ...conversationProposal(), type: NUTRITION_ARTIFACT_CAPABILITY.type,
        payload: { title: 'Linsen', subtitle: 'Marke', payload } });
      expect(artifact).toEqual({ kind: 'artifact', id: conversationProposal().artifact_id,
        type: 'kochwiki-nutrition', headline: 'Linsen', subtitle: 'Marke', payload });
      expect(nutritionBasisLabel(basis)).toBeTruthy();
      expect(artifact.metadata).toBeUndefined();
    },
  );

  it('permits completely unknown nutrition', () => {
    expect(isNutritionPresentation({ basis: 'per-serving', kcal: null, carbs: null, protein: null, fat: null })).toBe(true);
  });

  it.each([null, {}, values, { ...values, basis: 'G' },
    { ...values, basis: 'per-serving', kcal: -1 },
    { ...values, basis: 'per-serving', carbs: undefined },
    { ...values, basis: 'per-serving', protein: '12' },
    { ...values, basis: 'per-serving', fat: Infinity },
    { ...values, basis: 'per-serving', id: 123 },
    { ...values, basis: 'per-serving', servings: 2 },
  ])('contains malformed or incomplete nutrition: %j', payload => {
    expect(isNutritionPresentation(payload)).toBe(false);
    expect(mapConversationArtifact({ ...conversationProposal(), type: 'kochwiki-nutrition',
      payload: { title: 'Linsen', payload } }).type).toBe('kochwiki-unsupported');
  });
});
