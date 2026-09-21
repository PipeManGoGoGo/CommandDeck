export function fuzzyScore(haystack: string, needle: string): number {
  if (!needle.trim()) return 1;
  const hay = haystack.toLowerCase();
  const q = needle.trim().toLowerCase();
  const idx = hay.indexOf(q);
  if (idx >= 0) return 2000 - idx * 2 - (hay.length - q.length);
  let cursor = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = hay.indexOf(ch, cursor);
    if (found < 0) return 0;
    streak = found === cursor ? streak + 6 : 1;
    const boundary = found === 0 || /[\s\-_/]/.test(hay[found - 1] || "");
    score += streak + (boundary ? 8 : 0);
    cursor = found + 1;
  }
  return score;
}
