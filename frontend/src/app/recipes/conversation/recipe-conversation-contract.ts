import type { RecipeVersionOut } from '../../core/api/generated';
import { ArtifactResponse } from '@roithme0/chat-ui/conversation';
import { ChatArtifact } from '@roithme0/chat-ui/ui';
import type { FoodstuffOut } from '../../core/api/generated';
import type { Unit } from '../../core/api/generated';
import type { RecipeVersionWrite } from '../../core/api/generated';
import { RecipePresentation } from '../models/recipe-presentation';

export interface RecipeSessionInput {
  readonly source: {
    readonly external_reference: string;
    readonly recipe: {
      readonly name: string;
      readonly servings: number;
      readonly preparation_time: number | null;
      readonly origin_name: string | null;
      readonly origin_url: string | null;
      readonly ingredients: readonly {
        index: number;
        amount: number;
        foodstuff_reference: number;
      }[];
      readonly steps: readonly { index: number; description: string }[];
    };
  };
  readonly foodstuffs: readonly {
    external_reference: number;
    name: string;
    brand: string | null;
    unit: Unit;
    unit_verbose: string;
    kcal: number | null;
    carbs: number | null;
    protein: number | null;
    fat: number | null;
  }[];
}

export function mapSessionInput(
  source: RecipeVersionOut,
  foodstuffs: readonly FoodstuffOut[],
): RecipeSessionInput {
  return {
    source: {
      external_reference: source.recipeVersionId,
      recipe: {
        name: source.name,
        servings: source.servings,
        preparation_time: source.preptime,
        origin_name: source.originName,
        origin_url: source.originUrl,
        ingredients: source.ingredients.map(({ index, amount, foodstuff }) => ({
          index,
          amount,
          foodstuff_reference: foodstuff.id,
        })),
        steps: source.steps.map(({ index, description }) => ({
          index,
          description,
        })),
      },
    },
    foodstuffs: foodstuffs.map((foodstuff) => ({
      external_reference: foodstuff.id,
      name: foodstuff.name,
      brand: foodstuff.brand,
      unit: foodstuff.unit,
      unit_verbose: foodstuff.unitVerbose,
      kcal: foodstuff.kcal,
      carbs: foodstuff.carbs,
      protein: foodstuff.protein,
      fat: foodstuff.fat,
    })),
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

export function mapProposalArtifact(artifact: ArtifactResponse): ChatArtifact {
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
    payload: 'Dieser Inhalt ist kein unterstützter Rezeptvorschlag.',
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
