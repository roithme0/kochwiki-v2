from app.images.uploads import OwnedImageUploads
from app.foodstuffs.models.image_upload import FoodstuffImageUpload


class FoodstuffImageUploads(OwnedImageUploads):
    upload_model = FoodstuffImageUpload
