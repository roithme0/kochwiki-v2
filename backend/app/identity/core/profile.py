import unicodedata


def normalize_display_name(value: object) -> object:
    if not isinstance(value, str):
        return value
    if any(unicodedata.category(char) == "Cc" for char in value):
        raise ValueError("Invalid display name")
    return value.strip()
