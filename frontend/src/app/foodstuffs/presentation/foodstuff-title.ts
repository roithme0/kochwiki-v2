export function foodstuffTitle(foodstuff: {
  name: string;
  details: string | null;
}): string {
  return foodstuff.details
    ? `${foodstuff.name}, ${foodstuff.details}`
    : foodstuff.name;
}
