from app.foodstuffs.models.image_upload import FoodstuffImageUpload
from app.images.uploads import OwnedImageUploads


class FoodstuffImageUploads(OwnedImageUploads):
    upload_model = FoodstuffImageUpload
