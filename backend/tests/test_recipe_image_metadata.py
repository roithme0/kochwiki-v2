from datetime import datetime, timezone
from unittest.mock import Mock
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models.recipe_image import RecipeImage
from app.services.recipe_image_uploads import RecipeImageUploads
from test_recipe_image_uploads import png


def test_completion_commits_metadata_visible_to_another_session() -> None:
    storage = Mock()
    data = png()
    storage.read.return_value = data
    result = RecipeImageUploads(storage, SessionLocal).complete(uuid4())
    with SessionLocal() as session:
        saved = session.get(RecipeImage, result.id)
        assert saved is not None
        assert saved.object_key == result.object_key
        assert (saved.size, saved.width, saved.height) == (len(data), 2, 3)
        assert saved.sha256 == result.sha256
        assert saved.content_type == "image/png"
        assert saved.created_at == result.created_at


@pytest.mark.parametrize("field,value", [
    ("size", 0), ("size", 10485761), ("width", 0), ("width", 4097),
    ("height", 0), ("height", 4097), ("content_type", "image/jpeg"), ("sha256", "short"),
])
def test_database_rejects_invalid_image_metadata(field: str, value: int | str) -> None:
    record = RecipeImage(
        id=uuid4(), object_key=f"recipe-images/{uuid4()}.png", content_type="image/png",
        size=100, width=1, height=1, sha256="a" * 64, created_at=datetime.now(timezone.utc),
    )
    setattr(record, field, value)
    with pytest.raises(IntegrityError):
        with SessionLocal.begin() as session:
            session.add(record)
    with SessionLocal() as session:
        assert session.get(RecipeImage, record.id) is None


def test_database_rejects_duplicate_object_keys() -> None:
    key = f"recipe-images/{uuid4()}.png"
    for attempt in range(2):
        record = RecipeImage(
            id=uuid4(), object_key=key, content_type="image/png", size=100,
            width=1, height=1, sha256="a" * 64, created_at=datetime.now(timezone.utc),
        )
        if attempt == 0:
            with SessionLocal.begin() as session:
                session.add(record)
        else:
            with pytest.raises(IntegrityError):
                with SessionLocal.begin() as session:
                    session.add(record)
    with SessionLocal() as session:
        assert len(list(session.scalars(select(RecipeImage)))) == 1
