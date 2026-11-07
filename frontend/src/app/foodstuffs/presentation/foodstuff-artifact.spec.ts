import * as z from 'zod/mini';
import { zFoodstuffSummaryOut } from '../../core/api/generated/zod.gen';
import { mapConversationArtifact } from '../../recipes/conversation/recipe-conversation-contract';
import { conversationProposal } from '../../testing/conversation.fixtures';
import {
  FOODSTUFF_ARTIFACT_CAPABILITY,
  isFoodstuffPresentation,
} from './foodstuff-artifact';

const payload = {
  unit: 'G',
  kcal: 0,
  carbs: null,
  protein: 12,
  fat: null,
  fiber: 3,
};

describe('Foodstuff artifact contract', () => {
  it('preserves the name and details title, brand subtitle and nutrition without an id or fetch', () => {
    const artifact = mapConversationArtifact({
      ...conversationProposal(),
      type: FOODSTUFF_ARTIFACT_CAPABILITY.type,
      content: { title: 'Linsen, roh', subtitle: 'Marke', payload },
    });
    expect(artifact).toEqual({
      kind: 'artifact',
      id: conversationProposal().artifact_id,
      type: 'kochwiki-foodstuff',
      headline: 'Linsen, roh',
      subtitle: 'Marke',
      payload,
    });
  });

  it('permits absent brand and details with completely unknown nutrition', () => {
    const nutrition = {
      unit: 'PIECE',
      kcal: null,
      carbs: null,
      protein: null,
      fat: null,
      fiber: null,
    };
    const artifact = mapConversationArtifact({
      ...conversationProposal(),
      type: 'kochwiki-foodstuff',
      content: { title: 'Ei', payload: nutrition },
    });
    expect(artifact.subtitle).toBeUndefined();
    expect(artifact.payload).toEqual(nutrition);
  });

  it.each([
    null,
    {},
    { ...payload, details: 'roh' },
    { ...payload, unit: 'KG' },
    { ...payload, kcal: -1 },
    { ...payload, fiber: -1 },
    { ...payload, fiber: undefined },
    { ...payload, protein: '12' },
    { ...payload, carbs: undefined },
    { ...payload, extra: 'unexpected' },
    { ...payload, fat: Infinity },
  ])('rejects malformed or incomplete nutrition: %j', (value) => {
    expect(isFoodstuffPresentation(value)).toBe(false);
  });

  it('contains invalid foodstuff payloads instead of rendering them', () => {
    expect(
      mapConversationArtifact({
        ...conversationProposal(),
        type: 'kochwiki-foodstuff',
        content: { title: 'Linsen', payload: { ...payload, unit: 'KG' } },
      }).type,
    ).toBe('kochwiki-unsupported');
  });

  it('advertises the same nutrition constraints as the retrieved foodstuff contract', () => {
    const schema = z.toJSONSchema(zFoodstuffSummaryOut);
    const properties =
      FOODSTUFF_ARTIFACT_CAPABILITY.payloadSchema['properties'];
    expect(properties).toEqual(
      Object.fromEntries(
        ['unit', 'kcal', 'carbs', 'protein', 'fat', 'fiber'].map((key) => [
          key,
          schema.properties?.[key],
        ]),
      ),
    );
    expect(
      FOODSTUFF_ARTIFACT_CAPABILITY.payloadSchema['additionalProperties'],
    ).toBe(false);
    expect(
      FOODSTUFF_ARTIFACT_CAPABILITY.payloadSchema['required'],
    ).toHaveLength(6);
    expect(FOODSTUFF_ARTIFACT_CAPABILITY.titleDescription).toContain('name');
    expect(FOODSTUFF_ARTIFACT_CAPABILITY.titleDescription).toContain('details');
    expect(FOODSTUFF_ARTIFACT_CAPABILITY.subtitleDescription).toContain(
      'brand',
    );
  });
});
