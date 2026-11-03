from app.images.models import OwnedImageUpload


class RecipeImageUpload(OwnedImageUpload):
    __tablename__ = "recipe_image_upload"
