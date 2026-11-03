from app.images.uploads import OwnedImageUploads
from app.recipes.models.image_upload import RecipeImageUpload


class RecipeImageUploads(OwnedImageUploads):
    upload_model = RecipeImageUpload
