import { mapConversationArtifact } from '../conversation/recipe-conversation-contract';
import {
  conversationProposal,
  proposalId,
} from '../conversation/recipe-conversation.fixtures';
import {
  RECIPE_ARTIFACT_CAPABILITY,
  isRecipePresentation,
} from './recipe-artifact';

const foodstuff = {
  imageId: null,
  name: 'Tomaten',
  unitVerbose: 'g',
  kcal: 18,
  carbs: 3.9,
  protein: null,
  fat: 0,
};
const payload = {
  servings: 2,
  preptime: 25,
  kcal: { status: 'exact', value: 18 },
  carbs: { status: 'exact', value: 3.9 },
  protein: { status: 'unknown', value: null },
  fat: { status: 'exact', value: 0 },
  ingredients: [{ index: 1, amount: 100, foodstuff }],
  steps: [{ index: 1, description: 'Tomaten schneiden.' }],
};

describe('Recipe artifact contract', () => {
  it.each([null, '00000000-0000-4000-8000-000000000002'])(
    'accepts and relays a supplied image reference: %s',
    (imageId) => {
      const recipe = {
        ...payload,
        ingredients: [
          { ...payload.ingredients[0], foodstuff: { ...foodstuff, imageId } },
        ],
      };
      expect(isRecipePresentation(recipe)).toBe(true);
      const artifact = mapConversationArtifact({
        ...conversationProposal(),
        content: { title: 'Recipe', payload: recipe },
      });
      expect(artifact.type).toBe('kochwiki-recipe');
      expect(artifact.payload).toEqual(recipe);
    },
  );

  it.each([undefined, 'invalid', 42, '/storage/image.png'])(
    'rejects a missing or malformed image reference: %j',
    (imageId) => {
      const recipe = {
        ...payload,
        ingredients: [
          { ...payload.ingredients[0], foodstuff: { ...foodstuff, imageId } },
        ],
      };
      expect(isRecipePresentation(recipe)).toBe(false);
      expect(
        mapConversationArtifact({
          ...conversationProposal(),
          content: {
            title: 'Recipe',
            payload: recipe,
          } as unknown as ReturnType<typeof conversationProposal>['content'],
        }).type,
      ).toBe('kochwiki-unsupported');
    },
  );
  it('retains proposal identity only in metadata', () => {
    const artifact = mapConversationArtifact({
      ...conversationProposal(),
      content: {
        title: 'Tomatensalat',
        payload,
        metadata: { proposalId },
      },
    });
    expect(artifact.payload).toEqual(payload);
    expect(artifact.metadata).toEqual({ proposalId });
  });

  it.each([{ proposalId: 'invalid' }, { proposalId: 1 }, { extra: true }, []])(
    'rejects malformed recipe metadata: %j',
    (metadata) => {
      expect(
        mapConversationArtifact({
          ...conversationProposal(),
          content: {
            title: 'Tomatensalat',
            payload,
            metadata,
          } as unknown as ReturnType<typeof conversationProposal>['content'],
        }).type,
      ).toBe('kochwiki-unsupported');
    },
  );
  it('presents complete data without catalogue IDs, proposal identity or a save action', () => {
    const artifact = mapConversationArtifact({
      ...conversationProposal(),
      type: 'kochwiki-recipe',
      content: { title: 'Tomatensalat', payload },
    });
    expect(artifact).toEqual({
      kind: 'artifact',
      id: conversationProposal().artifact_id,
      type: 'kochwiki-recipe',
      headline: 'Tomatensalat',
      payload,
    });
    expect(artifact.metadata).toBeUndefined();
  });

  it('accepts unknown preparation time and nutrition without inventing values', () => {
    expect(
      isRecipePresentation({
        ...payload,
        preptime: null,
        kcal: { status: 'unknown', value: null },
      }),
    ).toBe(true);
  });

  it('preserves lower bounds in recipe artifacts', () => {
    const partial = {
      ...payload,
      kcal: { status: 'minimum', value: 18 },
      carbs: { status: 'exact', value: 3.9 },
      protein: { status: 'minimum', value: 0 },
    };
    expect(isRecipePresentation(partial)).toBe(true);
    const artifact = mapConversationArtifact({
      ...conversationProposal(),
      content: { title: 'Partial recipe', payload: partial },
    });
    expect(artifact.type).toBe('kochwiki-recipe');
    expect(artifact.payload).toEqual(partial);
  });

  it.each([
    null,
    {},
    { ...payload, preptime: undefined },
    { ...payload, preptime: 0 },
    { ...payload, kcal: -1 },
    { ...payload, fat: Infinity },
    { ...payload, proposalId: 'proposal' },
    {
      ...payload,
      ingredients: [
        { ...payload.ingredients[0], foodstuff: { ...foodstuff, id: 1 } },
      ],
    },
    {
      ...payload,
      ingredients: [
        {
          ...payload.ingredients[0],
          foodstuff: { ...foodstuff, protein: undefined },
        },
      ],
    },
    { ...payload, steps: [{ index: 1 }] },
  ])('contains invalid or non-presentational payloads: %j', (value) => {
    expect(isRecipePresentation(value)).toBe(false);
    expect(
      mapConversationArtifact({
        ...conversationProposal(),
        type: 'kochwiki-recipe',
        content: { title: 'Recipe', payload: value },
      }).type,
    ).toBe('kochwiki-unsupported');
  });

  it('advertises a strict presentation schema and recipe name header guidance', () => {
    expect(RECIPE_ARTIFACT_CAPABILITY.payloadSchema).toMatchObject({
      properties: {
        ingredients: {
          items: {
            properties: {
              foodstuff: {
                required: expect.arrayContaining(['imageId']) as unknown,
              },
            },
          },
        },
      },
    });
    expect(
      RECIPE_ARTIFACT_CAPABILITY.payloadSchema['additionalProperties'],
    ).toBe(false);
    expect(RECIPE_ARTIFACT_CAPABILITY.payloadSchema['required']).toContain(
      'preptime',
    );
    expect(RECIPE_ARTIFACT_CAPABILITY.titleDescription).toContain(
      'recipe name',
    );
  });
});
