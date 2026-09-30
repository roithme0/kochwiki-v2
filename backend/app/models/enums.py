from enum import StrEnum


class RecipeVersionState(StrEnum):
    ACTIVE = "active"
    DRAFT = "draft"
    HISTORICAL = "historical"
