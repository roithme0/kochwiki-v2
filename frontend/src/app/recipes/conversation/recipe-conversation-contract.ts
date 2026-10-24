import * as z from 'zod/mini';
import {
  presentSessionArtifact,
  SessionArtifactMapper,
  SessionCreationRequest,
} from '@roithme0/chat-ui/conversation';
import {
  ChatArtifact,
  ChatArtifactCapability,
  JSON_ARTIFACT_CAPABILITY,
} from '@roithme0/chat-ui/ui';
import { RecipePresentation } from '../models/recipe-presentation';
import {
  RECIPE_ARTIFACT_CAPABILITY,
  isRecipePresentation,
  isRecipeArtifactMetadata,
} from '../presentation/recipe-artifact';
import {
  FOODSTUFF_ARTIFACT_CAPABILITY,
  isFoodstuffPresentation,
} from '../../foodstuffs/presentation/foodstuff-artifact';
import {
  NUTRITION_ARTIFACT_CAPABILITY,
  isNutritionPresentation,
} from '../../core/presentation/nutrition-artifact';

export interface RecipeSessionInput {
  readonly artifact_capabilities: NonNullable<
    SessionCreationRequest['artifact_capabilities']
  >;
}

export type RecipeSessionArtifact = Parameters<SessionArtifactMapper>[0];

export function mapSessionInput(): RecipeSessionInput {
  return {
    artifact_capabilities: [
      JSON_ARTIFACT_CAPABILITY,
      FOODSTUFF_ARTIFACT_CAPABILITY,
      RECIPE_ARTIFACT_CAPABILITY,
      NUTRITION_ARTIFACT_CAPABILITY,
    ].map(sessionCapability),
  } satisfies SessionCreationRequest;
}

function sessionCapability(
  capability: ChatArtifactCapability,
): NonNullable<SessionCreationRequest['artifact_capabilities']>[number] {
  const { metadataSchema, payloadSchema, ...header } = capability;
  const schema = z.record(z.string(), z.json());
  return {
    ...header,
    payloadSchema: schema.parse(payloadSchema),
    ...(metadataSchema === undefined
      ? {}
      : { metadataSchema: schema.parse(metadataSchema) }),
  };
}

export function recipeArtifact(
  id: string,
  headline: string,
  recipe: RecipePresentation,
): ChatArtifact {
  const presentation = {
    servings: recipe.servings,
    preptime: recipe.preptime,
    kcal: { ...recipe.kcal },
    carbs: { ...recipe.carbs },
    protein: { ...recipe.protein },
    fat: { ...recipe.fat },
    ingredients: recipe.ingredients.map(({ index, amount, foodstuff }) => ({
      index,
      amount,
      foodstuff: {
        imageId: foodstuff.imageId,
        name: foodstuff.name,
        unitVerbose: foodstuff.unitVerbose,
        kcal: foodstuff.kcal,
        carbs: foodstuff.carbs,
        protein: foodstuff.protein,
        fat: foodstuff.fat,
      },
    })),
    steps: recipe.steps.map(({ index, description }) => ({
      index,
      description,
    })),
  } satisfies RecipePresentation;
  return {
    kind: 'artifact',
    id,
    type: 'kochwiki-recipe',
    headline,
    payload: presentation,
  };
}

export function mapConversationArtifact(
  artifact: RecipeSessionArtifact,
): ChatArtifact {
  if (artifact.type === JSON_ARTIFACT_CAPABILITY.type)
    return presentSessionArtifact(artifact);
  if (
    artifact.type === RECIPE_ARTIFACT_CAPABILITY.type &&
    isRecipePresentation(artifact.content.payload) &&
    isRecipeArtifactMetadata(artifact.content.metadata)
  ) {
    return presentSessionArtifact(artifact);
  }
  if (artifact.type === FOODSTUFF_ARTIFACT_CAPABILITY.type) {
    const presentation = presentSessionArtifact(artifact);
    if (isFoodstuffPresentation(presentation.payload)) return presentation;
  }
  if (
    artifact.type === NUTRITION_ARTIFACT_CAPABILITY.type &&
    isNutritionPresentation(artifact.content.payload)
  ) {
    return presentSessionArtifact(artifact);
  }
  return {
    kind: 'artifact',
    id: artifact.artifact_id,
    type: 'kochwiki-unsupported',
    headline: 'Inhalt nicht darstellbar',
    payload: 'Dieser Inhalt ist nicht unterstützt.',
  };
}
