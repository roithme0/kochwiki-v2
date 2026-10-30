from concurrent.futures import ThreadPoolExecutor
from typing import cast
from unittest.mock import Mock

import pytest

from app.images import dependencies
from app.images.dependencies import ImageStoragePool
from app.images.models import ImageKind
from app.infrastructure.storage.storage import Storage
from tests.infrastructure.storage.test_storage_adapter import configuration


def test_concurrent_requests_share_clients_until_pool_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapter = Mock(spec=Storage)
    factory = Mock(return_value=cast(Storage, adapter))
    monkeypatch.setattr(dependencies, "Storage", factory)
    config = configuration()
    pool = ImageStoragePool()
    try:
        with ThreadPoolExecutor(max_workers=8) as executor:
            requests = [
                executor.submit(pool.get, config, ImageKind.RECIPE) for _ in range(16)
            ]
            assert all(request.result(timeout=5) is adapter for request in requests)
        factory.assert_called_once_with(config, bucket=config.bucket_recipe_images)
        adapter.close.assert_not_called()
    finally:
        pool.close()
    pool.close()
    adapter.close.assert_called_once()


def test_pool_separates_buckets_and_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapters = [Mock(spec=Storage) for _ in range(3)]
    factory = Mock(side_effect=[cast(Storage, adapter) for adapter in adapters])
    monkeypatch.setattr(dependencies, "Storage", factory)
    config = configuration()
    changed = config.model_copy(update={"region": "another-region"})
    pool = ImageStoragePool()
    try:
        assert pool.get(config, ImageKind.RECIPE) is adapters[0]
        assert pool.get(config, ImageKind.FOODSTUFF) is adapters[1]
        assert pool.get(changed, ImageKind.RECIPE) is adapters[2]
        assert pool.get(config, ImageKind.RECIPE) is adapters[0]
        assert factory.call_count == 3
    finally:
        pool.close()
    for adapter in adapters:
        adapter.close.assert_called_once()
