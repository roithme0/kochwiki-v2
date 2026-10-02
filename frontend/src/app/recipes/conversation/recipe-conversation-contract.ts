import type { RecipeVersionOut } from '../../core/api/generated';
import { presentArtifact, ArtifactResponse } from '@roithme0/chat-ui/conversation';
import { ChatArtifact, ChatArtifactCapability, JSON_ARTIFACT_CAPABILITY } from '@roithme0/chat-ui/ui';
import { RecipePresentation } from '../models/recipe-presentation';
import { RECIPE_ARTIFACT_CAPABILITY, isRecipePresentation, isRecipeArtifactMetadata } from '../presentation/recipe-artifact';
import { FOODSTUFF_ARTIFACT_CAPABILITY, isFoodstuffPresentation } from '../../foodstuffs/presentation/foodstuff-artifact';

export interface RecipeSessionInput {
  readonly context: RecipeContext;
  readonly artifactCapabilities: readonly ChatArtifactCapability[];
}

export interface RecipeContext {
  readonly source: RecipeVersionOut;
}

export function mapSessionInput(source: RecipeVersionOut): RecipeSessionInput {
  return {
    context: { source: structuredClone(source) },
    artifactCapabilities: [JSON_ARTIFACT_CAPABILITY, FOODSTUFF_ARTIFACT_CAPABILITY, RECIPE_ARTIFACT_CAPABILITY],
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
    kcal: recipe.kcal,
    carbs: recipe.carbs,
    protein: recipe.protein,
    fat: recipe.fat,
    ingredients: recipe.ingredients.map(({ index, amount, foodstuff }) => ({
      index,
      amount,
      foodstuff: {
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

export function mapConversationArtifact(artifact: ArtifactResponse): ChatArtifact {
  if (artifact.type === JSON_ARTIFACT_CAPABILITY.type) return presentArtifact(artifact);
  if (artifact.type === RECIPE_ARTIFACT_CAPABILITY.type && isRecord(artifact.payload)
    && isRecipePresentation(artifact.payload['payload'])
    && isRecipeArtifactMetadata(artifact.payload['metadata'])) {
    return presentArtifact(artifact);
  }
  if (artifact.type === FOODSTUFF_ARTIFACT_CAPABILITY.type) {
    const presentation = presentArtifact(artifact);
    if (isFoodstuffPresentation(presentation.payload)) return presentation;
  }
  return {
    kind: 'artifact',
    id: artifact.artifact_id,
    type: 'kochwiki-unsupported',
    headline: 'Inhalt nicht darstellbar',
    payload: 'Dieser Inhalt ist nicht unterstützt.',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
