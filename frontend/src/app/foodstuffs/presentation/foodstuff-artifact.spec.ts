import * as z from 'zod/mini';
import { zFoodstuffSummaryOut } from '../../core/api/generated/zod.gen';
import { mapConversationArtifact } from '../../recipes/conversation/recipe-conversation-contract';
import { conversationProposal } from '../../recipes/conversation/recipe-conversation.fixtures';
import { FOODSTUFF_ARTIFACT_CAPABILITY, isFoodstuffPresentation } from './foodstuff-artifact';

const payload = { unit: 'G', kcal: 0, carbs: null, protein: 12, fat: null };

describe('Foodstuff artifact contract', () => {
  it('preserves explicit name/brand headers and nutrition without requiring an id or fetch', () => {
    const artifact = mapConversationArtifact({ ...conversationProposal(),
      type: FOODSTUFF_ARTIFACT_CAPABILITY.type,
      payload: { title: 'Linsen', subtitle: 'Marke', payload },
    });
    expect(artifact).toEqual({ kind: 'artifact', id: conversationProposal().artifact_id,
      type: 'kochwiki-foodstuff', headline: 'Linsen', subtitle: 'Marke', payload });
  });

  it('permits absent brand and completely unknown nutrition', () => {
    const nutrition = { unit: 'PIECE', kcal: null, carbs: null, protein: null, fat: null };
    const artifact = mapConversationArtifact({ ...conversationProposal(), type: 'kochwiki-foodstuff',
      payload: { title: 'Ei', payload: nutrition } });
    expect(artifact.subtitle).toBeUndefined();
    expect(artifact.payload).toEqual(nutrition);
  });

  it.each([null, {}, { ...payload, unit: 'KG' }, { ...payload, kcal: -1 },
    { ...payload, protein: '12' }, { ...payload, carbs: undefined },
    { ...payload, extra: 'unexpected' }, { ...payload, fat: Infinity },
  ])('rejects malformed or incomplete nutrition: %j', value => {
    expect(isFoodstuffPresentation(value)).toBe(false);
  });

  it('contains invalid foodstuff payloads instead of rendering them', () => {
    expect(mapConversationArtifact({ ...conversationProposal(), type: 'kochwiki-foodstuff',
      payload: { title: 'Linsen', payload: { ...payload, unit: 'KG' } } }).type).toBe('kochwiki-unsupported');
  });

  it('advertises the same nutrition constraints as the retrieved foodstuff contract', () => {
    const schema = z.toJSONSchema(zFoodstuffSummaryOut);
    const properties = FOODSTUFF_ARTIFACT_CAPABILITY.payloadSchema['properties'];
    expect(properties).toEqual(Object.fromEntries(['unit', 'kcal', 'carbs', 'protein', 'fat']
      .map(key => [key, schema.properties?.[key]])));
    expect(FOODSTUFF_ARTIFACT_CAPABILITY.payloadSchema['additionalProperties']).toBe(false);
    expect(FOODSTUFF_ARTIFACT_CAPABILITY.payloadSchema['required']).toHaveLength(5);
    expect(FOODSTUFF_ARTIFACT_CAPABILITY.titleDescription).toContain('name');
    expect(FOODSTUFF_ARTIFACT_CAPABILITY.subtitleDescription).toContain('brand');
  });
});
