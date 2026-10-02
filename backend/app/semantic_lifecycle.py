from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from uuid import UUID

from app.core.config import Settings
from app.db.session import SessionLocal
from app.mcp_server import MCPServices
from app.services.embedding_refresh import EmbeddingRefreshWorker
from app.services.embeddings import EmbeddingClient
from app.services.foodstuff_embeddings import FoodstuffEmbeddingService
from app.services.foodstuff_refresh import foodstuff_refresh as foodstuff_refresh_coordinator
from app.services.foodstuff_search import FoodstuffSemanticSearch
from app.services.recipe_embeddings import RecipeEmbeddingService
from app.services.recipe_refresh import recipe_refresh as recipe_refresh_coordinator
from app.services.recipe_search import RecipeSemanticSearch


@contextmanager
def semantic_search_services(settings: Settings, services: MCPServices) -> Iterator[EmbeddingClient]:
    with ExitStack() as cleanup:
        embeddings = EmbeddingClient.from_settings(settings)
        cleanup.callback(embeddings.close)
        services.bind_foodstuff_search(FoodstuffSemanticSearch(SessionLocal, embeddings))
        cleanup.callback(services.bind_foodstuff_search, None)
        services.bind_recipe_search(RecipeSemanticSearch(SessionLocal, embeddings))
        cleanup.callback(services.bind_recipe_search, None)
        yield embeddings


@contextmanager
def embedding_refresh_workers(embeddings: EmbeddingClient) -> Iterator[None]:
    with ExitStack() as cleanup:
        if embeddings.available:
            foodstuff_refresh_service = FoodstuffEmbeddingService(SessionLocal, embeddings)
            foodstuff_worker: EmbeddingRefreshWorker[int] = EmbeddingRefreshWorker(
                foodstuff_refresh_service.refresh_one,
                lambda: foodstuff_refresh_service.refresh_all(foodstuff_worker.is_stopping),
                coordinator=foodstuff_refresh_coordinator,
            )
            cleanup.callback(foodstuff_worker.stop)
            foodstuff_worker.start()

            recipe_refresh_service = RecipeEmbeddingService(SessionLocal, embeddings)
            recipe_worker: EmbeddingRefreshWorker[UUID] = EmbeddingRefreshWorker(
                recipe_refresh_service.refresh_one,
                lambda: recipe_refresh_service.refresh_all(recipe_worker.is_stopping),
                coordinator=recipe_refresh_coordinator,
            )
            cleanup.callback(recipe_worker.stop)
            recipe_worker.start()
        yield
