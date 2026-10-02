import type { ChatArtifactCapability } from '@roithme0/chat-ui/ui';
import * as z from 'zod/mini';
import { zFoodstuffSummaryOut, zRecipePresentationOut,
  zRecipePresentationIngredientOut } from '../../core/api/generated/zod.gen';
import type { RecipePresentation } from '../models/recipe-presentation';

const foodstuffSchema = z.pick(zFoodstuffSummaryOut, {
  name: true, unitVerbose: true, kcal: true, carbs: true, protein: true, fat: true,
});

const recipePresentationSchema = z.extend(zRecipePresentationOut, {
  ingredients: z.array(z.extend(zRecipePresentationIngredientOut, { foodstuff: foodstuffSchema })),
});

const recipeMetadataSchema = z.strictObject({
  proposalId: z.optional(z.uuid().check(z.meta({
    description: 'Use the exact proposalId returned by KochWiki for the stored proposal represented by this artifact. Display its resolved presentation from get_recipe_proposal. Omit for existing recipes or recipes without a stored proposal. This enables the user to save that stored proposal as a draft, including creation of its temporary foodstuffs.',
  }))),
});

export const RECIPE_ARTIFACT_CAPABILITY: ChatArtifactCapability = {
  type: 'kochwiki-recipe',
  description: 'Display an existing recipe or a resolved recipe proposal when useful for discussion. Do not automatically display every search result. Supply complete presentation data from the selected recipe or the resolved proposal presentation, including preparation time, ingredients, steps and per-serving nutrition. Use null for unknown nutrition or preparation time; do not invent values. Displaying a recipe does not create or save a proposal or draft. Include only the presentation fields required by this schema.',
  titleDescription: 'Use the recipe name as the title.',
  subtitleDescription: 'Omit the subtitle.',
  payloadSchema: z.record(z.string(), z.json()).parse(z.toJSONSchema(recipePresentationSchema)),
  metadataSchema: z.record(z.string(), z.json()).parse(z.toJSONSchema(recipeMetadataSchema)),
};

export function isRecipePresentation(value: unknown): value is RecipePresentation {
  return recipePresentationSchema.safeParse(value).success;
}

export function isRecipeArtifactMetadata(value: unknown): boolean {
  return value == null || recipeMetadataSchema.safeParse(value).success;
}

export function recipeProposalId(metadata: unknown): string | undefined {
  const parsed = recipeMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data.proposalId : undefined;
}
