import { mapConversationArtifact } from '../../recipes/conversation/recipe-conversation-contract';
import { conversationProposal } from '../../recipes/conversation/recipe-conversation.fixtures';
import {
  NUTRITION_ARTIFACT_CAPABILITY,
  isNutritionPresentation,
  nutritionBasisLabel,
} from './nutrition-artifact';

const values = {
  kcal: { status: 'minimum', value: 200.9 },
  carbs: { status: 'exact', value: 12 },
  protein: { status: 'minimum', value: 0 },
  fat: { status: 'unknown', value: null },
};

describe('Nutrition artifact contract', () => {
  it.each([
    'per-100-g',
    'per-100-ml',
    'per-piece',
    'per-serving',
    'whole-recipe',
  ] as const)(
    'preserves values and headers for %s independently of full item artifacts',
    (basis) => {
      const payload = { ...values, basis };
      const artifact = mapConversationArtifact({
        ...conversationProposal(),
        type: NUTRITION_ARTIFACT_CAPABILITY.type,
        payload: { title: 'Linsen', subtitle: 'Marke', payload },
      });
      expect(artifact).toEqual({
        kind: 'artifact',
        id: conversationProposal().artifact_id,
        type: 'kochwiki-nutrition',
        headline: 'Linsen',
        subtitle: 'Marke',
        payload,
      });
      expect(nutritionBasisLabel(basis)).toBeTruthy();
      expect(artifact.metadata).toBeUndefined();
    },
  );

  it('permits completely unknown nutrition', () => {
    const unknown = { status: 'unknown', value: null };
    expect(
      isNutritionPresentation({
        basis: 'per-serving',
        kcal: unknown,
        carbs: unknown,
        protein: unknown,
        fat: unknown,
      }),
    ).toBe(true);
  });

  it.each([
    { status: 'exact', value: null },
    { status: 'minimum', value: null },
    { status: 'unknown', value: 0 },
    { status: 'minimum', value: -1 },
    { status: 'exact', value: -1 },
    { status: 'exact', value: Infinity },
    { status: 'minimum', value: NaN },
    { status: 'estimated', value: 1 },
    { status: 'exact' },
    { value: 1 },
    { status: 'exact', value: 1, extra: true },
    12,
    null,
  ])('rejects malformed nutrient results: %j', (kcal) => {
    const payload = { ...values, basis: 'per-serving', kcal };
    expect(isNutritionPresentation(payload)).toBe(false);
    expect(
      mapConversationArtifact({
        ...conversationProposal(),
        type: 'kochwiki-nutrition',
        payload: { title: 'Linsen', payload },
      }).type,
    ).toBe('kochwiki-unsupported');
  });

  it.each([
    null,
    {},
    values,
    { ...values, basis: 'G' },
    { ...values, basis: 'per-serving', kcal: -1 },
    { ...values, basis: 'per-serving', carbs: undefined },
    { ...values, basis: 'per-serving', protein: '12' },
    { ...values, basis: 'per-serving', fat: Infinity },
    { ...values, basis: 'per-serving', id: 123 },
    { ...values, basis: 'per-serving', servings: 2 },
  ])('contains malformed or incomplete nutrition: %j', (payload) => {
    expect(isNutritionPresentation(payload)).toBe(false);
    expect(
      mapConversationArtifact({
        ...conversationProposal(),
        type: 'kochwiki-nutrition',
        payload: { title: 'Linsen', payload },
      }).type,
    ).toBe('kochwiki-unsupported');
  });
});
