import type { ChatArtifactCapability } from '@roithme0/chat-ui/ui';
import * as z from 'zod/mini';
import { zFoodstuffSummaryOut } from '../../core/api/generated/zod.gen';

const foodstuffPresentationSchema = z.pick(zFoodstuffSummaryOut, {
  unit: true,
  kcal: true,
  carbs: true,
  protein: true,
  fat: true,
  fiber: true,
});

export type FoodstuffPresentation = z.infer<typeof foodstuffPresentationSchema>;

export const FOODSTUFF_ARTIFACT_CAPABILITY: ChatArtifactCapability = {
  type: 'kochwiki-foodstuff',
  description:
    'Display foodstuff nutrition using the unit and all nutrition values, using null for missing values. Nutrition is per 100 g for G, per 100 ml for ML, and per piece for PIECE.',
  titleDescription:
    'Use the foodstuff name followed by a comma and space and its details as the title (name, details). When there are no details, use only the name without a trailing comma.',
  subtitleDescription:
    'Use the foodstuff brand as the subtitle. Omit the subtitle when there is no brand.',
  payloadSchema: z
    .record(z.string(), z.json())
    .parse(z.toJSONSchema(foodstuffPresentationSchema)),
};

export function isFoodstuffPresentation(
  value: unknown,
): value is FoodstuffPresentation {
  return foodstuffPresentationSchema.safeParse(value).success;
}
