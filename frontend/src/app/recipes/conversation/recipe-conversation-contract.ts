import type { RecipeVersionOut } from '../../core/api/generated';
import { presentArtifact, ArtifactResponse } from '@roithme0/chat-ui/conversation';
import { ChatArtifact, ChatArtifactCapability, JSON_ARTIFACT_CAPABILITY } from '@roithme0/chat-ui/ui';
import type { RecipeVersionWrite } from '../../core/api/generated';
import { RecipePresentation } from '../models/recipe-presentation';
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
    artifactCapabilities: [JSON_ARTIFACT_CAPABILITY, FOODSTUFF_ARTIFACT_CAPABILITY],
  };
}

export interface OriginalPresentation extends RecipePresentation {
  readonly role: 'original';
  readonly name?: never;
}

export interface ProposalPresentation extends RecipePresentation {
  readonly role: 'proposal';
  readonly name: string;
}

export type RecipeArtifactPresentation = OriginalPresentation | ProposalPresentation;
export type RecipeArtifactRole = RecipeArtifactPresentation['role'];

export function isProposalPresentation(
  value: unknown,
): value is ProposalPresentation {
  return (
    isRecipePresentation(value) &&
    isRecord(value) &&
    value['role'] === 'proposal' &&
    typeof value['name'] === 'string' &&
    value['name'].trim().length > 0
  );
}

export function proposalWrite(
  proposal: ProposalPresentation,
  source: Pick<RecipeVersionOut, 'originName' | 'originUrl'>,
): RecipeVersionWrite {
  return {
    name: proposal.name,
    servings: proposal.servings,
    preptime: proposal.preptime,
    originName: source.originName,
    originUrl: source.originUrl,
    ingredients: proposal.ingredients.map(({ index, amount, foodstuff }) => ({
      index,
      amount,
      foodstuffId: foodstuff.id,
    })),
    steps: proposal.steps.map(({ index, description }) => ({
      index,
      description,
    })),
  };
}

export function recipeArtifact(
  id: string,
  headline: string,
  recipe: RecipePresentation,
  proposalName?: string,
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
      foodstuff: { ...foodstuff },
    })),
    steps: recipe.steps.map(({ index, description }) => ({
      index,
      description,
    })),
  } satisfies RecipePresentation;
  const payload = proposalName === undefined
    ? { ...presentation, role: 'original' } satisfies OriginalPresentation
    : { ...presentation, role: 'proposal', name: proposalName } satisfies ProposalPresentation;
  return {
    kind: 'artifact',
    id,
    type: 'kochwiki-recipe',
    headline,
    payload,
  };
}

export function mapConversationArtifact(artifact: ArtifactResponse): ChatArtifact {
  if (artifact.type === JSON_ARTIFACT_CAPABILITY.type) return presentArtifact(artifact);
  if (artifact.type === FOODSTUFF_ARTIFACT_CAPABILITY.type) {
    const presentation = presentArtifact(artifact);
    if (isFoodstuffPresentation(presentation.payload)) return presentation;
  }
  const payload = artifact.payload;
  if (
    artifact.type === 'recipe.proposal' &&
    isRecord(payload) &&
    typeof payload['name'] === 'string' &&
    payload['name'].trim().length > 0 &&
    isProposalBase(payload['base']) &&
    isRecipePresentation(payload['recipe'])
  ) {
    return recipeArtifact(
      artifact.artifact_id,
      `Vorschlag: ${payload['name']}`,
      payload['recipe'],
      payload['name'],
    );
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

function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function nullableNumber(value: unknown): boolean {
  return (
    value === null || (typeof value === 'number' && Number.isFinite(value))
  );
}

function nutrition(value: Record<string, unknown>): boolean {
  return ['kcal', 'carbs', 'protein', 'fat'].every((key) =>
    nullableNumber(value[key]),
  );
}

function isProposalBase(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['kind'] === 'source' ||
      (value['kind'] === 'proposal' &&
        typeof value['proposal_id'] === 'string' &&
        value['proposal_id'].length > 0))
  );
}

export function isRecipePresentation(
  value: unknown,
): value is RecipePresentation {
  return (
    isRecord(value) &&
    integer(value['servings'], 1, 99) &&
    (value['preptime'] === null || integer(value['preptime'], 1, 999)) &&
    nutrition(value) &&
    Array.isArray(value['ingredients']) &&
    value['ingredients'].every((ingredient: unknown) => {
      if (
        !isRecord(ingredient) ||
        !integer(ingredient['index'], 1, 99) ||
        typeof ingredient['amount'] !== 'number' ||
        !Number.isFinite(ingredient['amount']) ||
        ingredient['amount'] <= 0 ||
        ingredient['amount'] > 9999
      )
        return false;
      const foodstuff = ingredient['foodstuff'];
      return (
        isRecord(foodstuff) &&
        integer(foodstuff['id'], 1, Number.MAX_SAFE_INTEGER) &&
        typeof foodstuff['name'] === 'string' &&
        typeof foodstuff['unitVerbose'] === 'string' &&
        (foodstuff['brand'] === null ||
          typeof foodstuff['brand'] === 'string') &&
        (foodstuff['unit'] === 'G' ||
          foodstuff['unit'] === 'ML' ||
          foodstuff['unit'] === 'PIECE') &&
        nutrition(foodstuff)
      );
    }) &&
    Array.isArray(value['steps']) &&
    value['steps'].every(
      (step: unknown) =>
        isRecord(step) &&
        integer(step['index'], 1, 99) &&
        typeof step['description'] === 'string' &&
        step['description'].length > 0 &&
        step['description'].length <= 200,
    )
  );
}
