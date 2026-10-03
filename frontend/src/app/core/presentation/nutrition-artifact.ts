import type { ChatArtifactCapability } from '@roithme0/chat-ui/ui';
import * as z from 'zod/mini';
import { zFoodstuffSummaryOut } from '../api/generated/zod.gen';

const nutritionPresentationSchema = z.extend(z.pick(zFoodstuffSummaryOut, {
  kcal: true, carbs: true, protein: true, fat: true,
}), {
  basis: z.enum(['per-100-g', 'per-100-ml', 'per-piece', 'per-serving', 'whole-recipe']),
});

export type NutritionPresentation = z.infer<typeof nutritionPresentationSchema>;

const BASIS_LABELS: Record<NutritionPresentation['basis'], string> = {
  'per-100-g': 'pro 100 g',
  'per-100-ml': 'pro 100 ml',
  'per-piece': 'pro St\u00fcck',
  'per-serving': 'pro Portion',
  'whole-recipe': 'gesamtes Rezept',
};

export const NUTRITION_ARTIFACT_CAPABILITY: ChatArtifactCapability = {
  type: 'kochwiki-nutrition',
  description: 'Display calories and macronutrients for a foodstuff or recipe. Supply kcal, carbs, protein and fat as numbers or explicit null for unknown values, and an explicit basis: per-100-g, per-100-ml, per-piece, per-serving or whole-recipe. Values must already use that basis; the display does not calculate or convert them. This artifact has no save or editing actions.',
  titleDescription: 'Use the foodstuff or recipe name as the title.',
  subtitleDescription: 'Use the foodstuff brand as the subtitle when available. Otherwise omit the subtitle.',
  payloadSchema: z.record(z.string(), z.json()).parse(z.toJSONSchema(nutritionPresentationSchema)),
};

export function isNutritionPresentation(value: unknown): value is NutritionPresentation {
  return nutritionPresentationSchema.safeParse(value).success;
}

export function nutritionBasisLabel(basis: NutritionPresentation['basis']): string {
  return BASIS_LABELS[basis];
}
