/** Header backgrounds follow the displayed score as a percentage. */
export function resultScoreTone(score: number): string {
  if (score >= 90) return 'score-excellent';
  if (score >= 70) return 'score-passed';
  if (score >= 50) return 'score-partial';
  return 'score-low';
}
