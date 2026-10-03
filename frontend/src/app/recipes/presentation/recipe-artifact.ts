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
    description: 'Optional exact KochWiki proposalId identifying the stored proposal represented by this presentation. Valid only when this presentation represents that stored proposal. Its presence enables the save button for that proposal.',
  }))),
});

export const RECIPE_ARTIFACT_CAPABILITY: ChatArtifactCapability = {
  type: 'kochwiki-recipe',
  description: 'Display a complete existing recipe or resolved recipe proposal: servings, preparation time, ingredients, steps and per-serving nutrition. Supply only the presentation fields in the schema, using null for unknown nutrition or preparation time. Displaying a recipe does not create or save domain data.',
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
