export function rewardFor(correct: boolean, streak: number): number {
  if (!correct) return 0;
  return 10 + (streak >= 3 ? 5 : 0);
}

export function canBuy(bells: number, price: number): boolean {
  return price >= 0 && bells >= price;
}
