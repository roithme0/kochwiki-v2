from enum import StrEnum


class RecipeVersionState(StrEnum):
    ACTIVE = "active"
    DRAFT = "draft"
    HISTORICAL = "historical"


SEARCHABLE_RECIPE_STATES = (RecipeVersionState.ACTIVE, RecipeVersionState.DRAFT)
