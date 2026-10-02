from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from app.models.enums import RecipeVersionState
from app.models.foodstuff import Foodstuff
from app.models.recipe import Ingredient, RecipeLineage, RecipeVersion, Step
from app.schemas.recipe import (
    IngredientOut,
    IngredientWrite,
    RecipePresentationIngredientOut,
    RecipePresentationOut,
    RecipePresentationResolve,
    RecipePresentationStepOut,
    RecipeVersionOut,
    RecipeVersionWrite,
    StepOut,
    StepWrite,
)
from app.services.exceptions import ConflictError, NotFoundError
from app.services.foodstuffs import foodstuff_summary_out
from app.services.recipe_embeddings import remove_recipe_embedding
from app.services.recipe_nutrition import ResolvedNutritionIngredient, per_serving, total_nutrition
from app.services.recipe_refresh import mark_recipe_refresh


def list_recipe_versions(session: Session) -> Sequence[RecipeVersion]:
    return session.scalars(
        _recipe_version_statement()
        .where(RecipeVersion.state.in_((RecipeVersionState.ACTIVE, RecipeVersionState.DRAFT)))
        .order_by(RecipeVersion.last_modified.desc(), RecipeVersion.version_id.desc())
    ).all()


def get_active_recipe_version(session: Session, lineage_id: UUID) -> RecipeVersion:
    version = session.scalar(
        _recipe_version_statement().where(
            RecipeVersion.lineage_id == lineage_id,
            RecipeVersion.state == RecipeVersionState.ACTIVE,
        )
    )
    if version is None:
        raise NotFoundError(f"Recipe lineage with id {lineage_id} not found")
    return version


def get_recipe_version_by_id(session: Session, lineage_id: UUID, version_id: UUID) -> RecipeVersion:
    version = session.scalar(
        _recipe_version_statement().where(
            RecipeVersion.lineage_id == lineage_id,
            RecipeVersion.version_id == version_id,
        )
    )
    if version is None:
        raise NotFoundError(f"Recipe version with id {version_id} not found")
    return version


def list_historical_recipe_versions(session: Session, lineage_id: UUID) -> Sequence[RecipeVersion]:
    _get_lineage(session, lineage_id)
    return session.scalars(
        _recipe_version_statement()
        .where(RecipeVersion.lineage_id == lineage_id, RecipeVersion.state == RecipeVersionState.HISTORICAL)
        .order_by(RecipeVersion.last_modified.desc(), RecipeVersion.version_id.desc())
    ).all()


def create_recipe(session: Session, payload: RecipeVersionWrite) -> RecipeVersion:
    foodstuffs = _foodstuffs_for_ingredients(session, payload.ingredients)
    now = _now()
    lineage = RecipeLineage(created_at=now)
    version = _new_recipe_version(lineage, payload, foodstuffs, RecipeVersionState.ACTIVE, now)
    session.add(lineage)
    session.flush()
    mark_recipe_refresh(session, version.version_id)
    return get_recipe_version_by_id(session, lineage.id, version.version_id)


def publish_active_recipe_edit(session: Session, lineage_id: UUID, payload: RecipeVersionWrite) -> RecipeVersion:
    foodstuffs = _foodstuffs_for_ingredients(session, payload.ingredients)
    active_version = _get_active_recipe_version_for_update(session, lineage_id)
    now = _now()
    active_version.state = RecipeVersionState.HISTORICAL
    remove_recipe_embedding(session, active_version.version_id)
    session.flush()
    version = _new_recipe_version(active_version.lineage, payload, foodstuffs, RecipeVersionState.ACTIVE, now)
    session.add(version)
    session.flush()
    mark_recipe_refresh(session, version.version_id)
    return get_recipe_version_by_id(session, lineage_id, version.version_id)


def create_recipe_draft(session: Session, lineage_id: UUID, payload: RecipeVersionWrite) -> RecipeVersion:
    lineage = _get_lineage(session, lineage_id)
    foodstuffs = _foodstuffs_for_ingredients(session, payload.ingredients)
    version = _new_recipe_version(lineage, payload, foodstuffs, RecipeVersionState.DRAFT, _now())
    session.add(version)
    session.flush()
    mark_recipe_refresh(session, version.version_id)
    return get_recipe_version_by_id(session, lineage_id, version.version_id)


def update_recipe_draft(session: Session, lineage_id: UUID, version_id: UUID, payload: RecipeVersionWrite) -> RecipeVersion:
    draft_version = _get_recipe_version_for_update(session, lineage_id, version_id)
    if draft_version.state != RecipeVersionState.DRAFT:
        raise ConflictError("Only draft recipe versions can be updated")
    foodstuffs = _foodstuffs_for_ingredients(session, payload.ingredients)
    previous_name = draft_version.name
    _apply_version_content(session, draft_version, payload, foodstuffs)
    draft_version.last_modified = _now()
    session.flush()
    if previous_name != draft_version.name:
        mark_recipe_refresh(session, version_id)
    return get_recipe_version_by_id(session, lineage_id, version_id)


def publish_recipe_draft(session: Session, lineage_id: UUID, version_id: UUID) -> RecipeVersion:
    draft_version = _get_recipe_version_for_update(session, lineage_id, version_id)
    if draft_version.state != RecipeVersionState.DRAFT:
        raise ConflictError("Only draft recipe versions can be published")
    active_version = _get_active_recipe_version_for_update(session, lineage_id)
    active_version.state = RecipeVersionState.HISTORICAL
    remove_recipe_embedding(session, active_version.version_id)
    session.flush()
    draft_version.state = RecipeVersionState.ACTIVE
    draft_version.last_modified = _now()
    session.flush()
    mark_recipe_refresh(session, version_id)
    return get_recipe_version_by_id(session, lineage_id, version_id)


def discard_recipe_draft(session: Session, lineage_id: UUID, version_id: UUID) -> None:
    draft_version = _get_recipe_version_for_update(session, lineage_id, version_id)
    if draft_version.state != RecipeVersionState.DRAFT:
        raise ConflictError("Only draft recipe versions can be discarded")
    session.delete(draft_version)
    session.flush()


def delete_recipe_lineage(session: Session, lineage_id: UUID) -> None:
    lineage = _get_lineage(session, lineage_id)
    session.delete(lineage)
    session.flush()


def recipe_version_out(version: RecipeVersion) -> RecipeVersionOut:
    total_kcal = total_nutrition(version.ingredients, "kcal")
    total_carbs = total_nutrition(version.ingredients, "carbs")
    total_protein = total_nutrition(version.ingredients, "protein")
    total_fat = total_nutrition(version.ingredients, "fat")
    return RecipeVersionOut(
        recipeLineageId=version.lineage_id,
        recipeVersionId=version.version_id,
        state=version.state,
        createdAt=version.created_at,
        lastModified=version.last_modified,
        name=version.name,
        servings=version.servings,
        preptime=version.preptime,
        originName=version.origin_name,
        originUrl=version.origin_url,
        kcal=per_serving(total_kcal, version.servings),
        carbs=per_serving(total_carbs, version.servings),
        protein=per_serving(total_protein, version.servings),
        fat=per_serving(total_fat, version.servings),
        ingredients=[ingredient_out(item) for item in sorted(version.ingredients, key=lambda item: item.index)],
        steps=[step_out(item) for item in sorted(version.steps, key=lambda item: item.index)],
    )


def resolve_recipe_presentation(session: Session, payload: RecipePresentationResolve) -> RecipePresentationOut:
    foodstuffs = _foodstuffs_for_ingredients(session, payload.ingredients)
    ingredients = [
        RecipePresentationIngredientOut(
            index=ingredient.index,
            amount=ingredient.amount,
            foodstuff=foodstuff_summary_out(foodstuffs[ingredient.foodstuffId]),
        )
        for ingredient in sorted(payload.ingredients, key=lambda item: item.index)
    ]
    nutrition_ingredients = [
        ResolvedNutritionIngredient(amount=ingredient.amount, foodstuff=foodstuffs[ingredient.foodstuffId])
        for ingredient in payload.ingredients
    ]
    return RecipePresentationOut(
        servings=payload.servings,
        preptime=payload.preptime,
        kcal=per_serving(total_nutrition(nutrition_ingredients, "kcal"), payload.servings),
        carbs=per_serving(total_nutrition(nutrition_ingredients, "carbs"), payload.servings),
        protein=per_serving(total_nutrition(nutrition_ingredients, "protein"), payload.servings),
        fat=per_serving(total_nutrition(nutrition_ingredients, "fat"), payload.servings),
        ingredients=ingredients,
        steps=[
            RecipePresentationStepOut(index=step.index, description=step.description)
            for step in sorted(payload.steps, key=lambda item: item.index)
        ],
    )


def ingredient_out(ingredient: Ingredient) -> IngredientOut:
    return IngredientOut(
        id=ingredient.id,
        index=ingredient.index,
        amount=ingredient.amount,
        foodstuff=foodstuff_summary_out(ingredient.foodstuff),
        recipeVersionId=ingredient.recipe_version_id,
    )


def step_out(step: Step) -> StepOut:
    return StepOut(
        id=step.id,
        index=step.index,
        description=step.description,
        recipeVersionId=step.recipe_version_id,
    )


def list_ingredients(session: Session) -> Sequence[Ingredient]:
    return session.scalars(
        select(Ingredient)
        .options(selectinload(Ingredient.foodstuff), selectinload(Ingredient.recipe_version))
        .order_by(Ingredient.id)
    ).all()


def list_steps(session: Session) -> Sequence[Step]:
    return session.scalars(select(Step).options(selectinload(Step.recipe_version)).order_by(Step.id)).all()


def _recipe_version_statement() -> Select[tuple[RecipeVersion]]:
    return select(RecipeVersion).options(
        selectinload(RecipeVersion.ingredients).selectinload(Ingredient.foodstuff),
        selectinload(RecipeVersion.steps),
    )


def _get_lineage(session: Session, lineage_id: UUID) -> RecipeLineage:
    lineage = session.get(RecipeLineage, lineage_id)
    if lineage is None:
        raise NotFoundError(f"Recipe lineage with id {lineage_id} not found")
    return lineage


def _get_active_recipe_version_for_update(session: Session, lineage_id: UUID) -> RecipeVersion:
    version = session.scalar(
        select(RecipeVersion)
        .where(RecipeVersion.lineage_id == lineage_id, RecipeVersion.state == RecipeVersionState.ACTIVE)
        .with_for_update()
    )
    if version is None:
        raise NotFoundError(f"Recipe lineage with id {lineage_id} not found")
    return version


def _get_recipe_version_for_update(session: Session, lineage_id: UUID, version_id: UUID) -> RecipeVersion:
    version = session.scalar(
        select(RecipeVersion)
        .where(RecipeVersion.lineage_id == lineage_id, RecipeVersion.version_id == version_id)
        .with_for_update()
    )
    if version is None:
        raise NotFoundError(f"Recipe version with id {version_id} not found")
    return version


def _new_recipe_version(
    lineage: RecipeLineage,
    payload: RecipeVersionWrite,
    foodstuffs: dict[int, Foodstuff],
    state: RecipeVersionState,
    timestamp: datetime,
) -> RecipeVersion:
    version = RecipeVersion(
        state=state,
        created_at=timestamp,
        last_modified=timestamp,
        name=payload.name,
        servings=payload.servings,
        preptime=payload.preptime,
        origin_name=payload.originName,
        origin_url=payload.originUrl,
    )
    version.ingredients = _new_ingredients(payload.ingredients, foodstuffs)
    version.steps = _new_steps(payload.steps)
    lineage.versions.append(version)
    return version


def _apply_version_content(
    session: Session,
    version: RecipeVersion,
    payload: RecipeVersionWrite,
    foodstuffs: dict[int, Foodstuff],
) -> None:
    _replace_version_ingredients(session, version, payload.ingredients, foodstuffs)
    _replace_version_steps(session, version, payload.steps)
    version.name = payload.name
    version.servings = payload.servings
    version.preptime = payload.preptime
    version.origin_name = payload.originName
    version.origin_url = payload.originUrl


def _foodstuffs_for_ingredients(session: Session, ingredients: Sequence[IngredientWrite]) -> dict[int, Foodstuff]:
    foodstuff_ids = [ingredient.foodstuffId for ingredient in ingredients]
    if len(foodstuff_ids) != len(set(foodstuff_ids)):
        raise ConflictError("A foodstuff may only occur once per recipe")
    if not foodstuff_ids:
        return {}
    foodstuffs = session.scalars(select(Foodstuff).where(Foodstuff.id.in_(foodstuff_ids))).all()
    by_id = {foodstuff.id: foodstuff for foodstuff in foodstuffs}
    missing_ids = sorted(set(foodstuff_ids).difference(by_id))
    if missing_ids:
        raise NotFoundError(f"Foodstuff with id {missing_ids[0]} not found")
    return by_id


def _new_ingredients(payloads: list[IngredientWrite], foodstuffs: dict[int, Foodstuff]) -> list[Ingredient]:
    return [
        Ingredient(index=payload.index, amount=payload.amount, foodstuff=foodstuffs[payload.foodstuffId])
        for payload in payloads
    ]


def _replace_version_ingredients(
    session: Session,
    version: RecipeVersion,
    payloads: list[IngredientWrite],
    foodstuffs: dict[int, Foodstuff],
) -> None:
    version.ingredients.clear()
    session.flush()
    version.ingredients = _new_ingredients(payloads, foodstuffs)


def _replace_version_steps(session: Session, version: RecipeVersion, payloads: list[StepWrite]) -> None:
    version.steps.clear()
    session.flush()
    version.steps = _new_steps(payloads)


def _new_steps(payloads: list[StepWrite]) -> list[Step]:
    return [Step(index=payload.index, description=payload.description) for payload in payloads]


def _now() -> datetime:
    return datetime.now(timezone.utc)
