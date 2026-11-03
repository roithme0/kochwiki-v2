from collections.abc import Iterable, Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.foodstuffs.models.foodstuff import Foodstuff
from app.recipes.models.recipe import Ingredient
from app.foodstuffs.schemas.foodstuff import (
    FoodstuffCreate,
    FoodstuffOut,
    FoodstuffSummaryOut,
    FoodstuffUpdate,
)
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.foodstuffs.services.embeddings import mark_foodstuff_refresh
from app.infrastructure.database.integrity import flush_for_unique_conflict
from app.images.models import ImageAsset, ImageKind


def foodstuff_summary_out(foodstuff: Foodstuff) -> FoodstuffSummaryOut:
    return FoodstuffSummaryOut(
        id=foodstuff.id,
        imageId=foodstuff.image_id,
        name=foodstuff.name,
        brand=foodstuff.brand,
        unit=foodstuff.unit,
        unitVerbose=foodstuff.unit.verbose_name,
        kcal=foodstuff.kcal,
        carbs=foodstuff.carbs,
        protein=foodstuff.protein,
        fat=foodstuff.fat,
        fiber=foodstuff.fiber,
    )


def foodstuff_out(foodstuff: Foodstuff) -> FoodstuffOut:
    summary = foodstuff_summary_out(foodstuff)
    return FoodstuffOut(
        id=summary.id,
        imageId=summary.imageId,
        name=summary.name,
        brand=summary.brand,
        unit=summary.unit,
        unitVerbose=summary.unitVerbose,
        kcal=summary.kcal,
        carbs=summary.carbs,
        protein=summary.protein,
        fat=summary.fat,
        fiber=summary.fiber,
        recipeVersionIds=sorted(
            {ingredient.recipe_version_id for ingredient in foodstuff.ingredients}
        ),
    )


def list_foodstuffs(session: Session, *, owner_id: int) -> Sequence[Foodstuff]:
    statement = (
        select(Foodstuff)
        .where(Foodstuff.owner_id == owner_id)
        .options(selectinload(Foodstuff.ingredients))
        .order_by(Foodstuff.id)
    )
    return session.scalars(statement).all()


def get_foodstuff(session: Session, foodstuff_id: int) -> Foodstuff:
    statement = (
        select(Foodstuff)
        .options(selectinload(Foodstuff.ingredients))
        .where(Foodstuff.id == foodstuff_id)
    )
    foodstuff = session.scalar(statement)
    if foodstuff is None:
        raise NotFoundError(f"Foodstuff with id {foodstuff_id} not found")
    return foodstuff


def create_foodstuff(
    session: Session, payload: FoodstuffCreate, *, owner_id: int
) -> Foodstuff:
    _validate_image(session, payload.imageId, owner_id=owner_id)
    foodstuff = Foodstuff(
        **payload.model_dump(exclude={"imageId"}),
        image_id=payload.imageId,
        owner_id=owner_id,
    )
    session.add(foodstuff)
    flush_for_unique_conflict(
        session,
        "uq_foodstuff_owner_name_brand",
        "A foodstuff with the same name and brand already exists",
    )
    mark_foodstuff_refresh(session, foodstuff.id)
    return get_foodstuff(session, foodstuff.id)


def update_foodstuff(
    session: Session, foodstuff_id: int, payload: FoodstuffUpdate, *, owner_id: int
) -> Foodstuff:
    foodstuff = get_foodstuff(session, foodstuff_id)
    require_foodstuff_owner(foodstuff, owner_id)
    if "imageId" in payload.model_fields_set and payload.imageId != foodstuff.image_id:
        _validate_image(session, payload.imageId, owner_id=owner_id)
    previous_input = (foodstuff.name, foodstuff.brand or "")
    for field_name, value in payload.model_dump(
        exclude_unset=True, exclude={"imageId"}
    ).items():
        setattr(foodstuff, field_name, value)
    if "imageId" in payload.model_fields_set:
        foodstuff.image_id = payload.imageId
    flush_for_unique_conflict(
        session,
        "uq_foodstuff_owner_name_brand",
        "A foodstuff with the same name and brand already exists",
    )
    if previous_input != (foodstuff.name, foodstuff.brand or ""):
        mark_foodstuff_refresh(session, foodstuff.id)
    return get_foodstuff(session, foodstuff.id)


def require_foodstuff_owner(foodstuff: Foodstuff, owner_id: int) -> None:
    if foodstuff.owner_id != owner_id:
        raise ForbiddenError(
            "Only the foodstuff owner may modify or use this foodstuff"
        )


def owned_foodstuffs_by_id(
    session: Session, foodstuff_ids: Iterable[int], *, owner_id: int
) -> dict[int, Foodstuff]:
    requested = set(foodstuff_ids)
    if not requested:
        return {}
    found = {
        foodstuff.id: foodstuff
        for foodstuff in session.scalars(
            select(Foodstuff).where(Foodstuff.id.in_(requested))
        )
    }
    missing = sorted(requested - found.keys())
    if missing:
        raise NotFoundError(f"Foodstuff with id {missing[0]} not found")
    for foodstuff in found.values():
        require_foodstuff_owner(foodstuff, owner_id)
    return found


def _validate_image(session: Session, image_id: UUID | None, *, owner_id: int) -> None:
    if image_id is not None:
        image = session.get(ImageAsset, image_id)
        if image is None or image.kind != ImageKind.FOODSTUFF:
            raise NotFoundError(f"Foodstuff image with id {image_id} not found")
        if image.uploader_id != owner_id:
            raise ForbiddenError(
                "Only images uploaded by the foodstuff owner may be attached"
            )


def delete_foodstuff(session: Session, foodstuff_id: int, *, owner_id: int) -> None:
    foodstuff = get_foodstuff(session, foodstuff_id)
    require_foodstuff_owner(foodstuff, owner_id)
    usage_count = session.scalar(
        select(func.count())
        .select_from(Ingredient)
        .where(Ingredient.foodstuff_id == foodstuff.id)
    )
    if usage_count and usage_count > 0:
        raise ConflictError("Foodstuff cannot be deleted while it is used by a recipe")
    session.delete(foodstuff)
    session.flush()
