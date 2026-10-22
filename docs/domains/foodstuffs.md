# Foodstuffs

Foodstuffs are reusable catalogue entries used by [recipes](recipes.md) as ingredients.

## Glossary

| Term | Meaning |
| --- | --- |
| Foodstuff (`Foodstuff`, Lebensmittel) | A named food or product with a unit, optional brand, nutrition values, and image. |
| Brand (`brand`, Marke) | Optional manufacturer or product brand distinguishing a foodstuff. |
| Unit (`unit`, Einheit) | How an ingredient amount is measured: grams (`G`, g), millilitres (`ML`, ml), or pieces (`PIECE`, Stk.). |
| Nutrition values (Nährwerte) | Energy (`kcal`) and amounts of carbohydrate (`carbs`), protein (`protein`), and fat (`fat`). Each value may be unknown independently. |
| Nutrition basis | Values apply per 100 g, per 100 ml, or per piece, according to the foodstuff's unit. |

## Important distinctions

- A foodstuff describes the catalogue item; an [ingredient](recipes.md#glossary) records how much of it a recipe version uses.
- Unknown nutrition is stored as `null`. Zero means a known zero value.
- Recipe versions reference shared foodstuffs. Changes to their nutrition values or units affect recipe calculations, including historical versions.
- A foodstuff cannot be deleted while any recipe version references it.
