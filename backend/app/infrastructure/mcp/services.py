from app.foodstuffs.services.search import FoodstuffSemanticSearch
from app.infrastructure.embeddings.embeddings import SemanticSearchUnavailable
from app.recipes.services.proposal_store import RecipeProposalStore
from app.recipes.services.search import RecipeSemanticSearch


class MCPServices:
    def __init__(self, recipe_proposals: RecipeProposalStore) -> None:
        self.recipe_proposals = recipe_proposals
        self._foodstuff_search: FoodstuffSemanticSearch | None = None
        self._recipe_search: RecipeSemanticSearch | None = None

    def bind_foodstuff_search(self, search: FoodstuffSemanticSearch | None) -> None:
        self._foodstuff_search = search

    def get_foodstuff_search(self) -> FoodstuffSemanticSearch:
        if self._foodstuff_search is None:
            raise SemanticSearchUnavailable(
                "Semantic search unavailable: backend is not running"
            )
        return self._foodstuff_search

    def bind_recipe_search(self, search: RecipeSemanticSearch | None) -> None:
        self._recipe_search = search

    def get_recipe_search(self) -> RecipeSemanticSearch:
        if self._recipe_search is None:
            raise SemanticSearchUnavailable(
                "Semantic search unavailable: backend is not running"
            )
        return self._recipe_search
