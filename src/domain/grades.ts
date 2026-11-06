export const GRADES = ['5', '4', '3', 'p2', '2', 'p1', '1'] as const;
export type GradeId = (typeof GRADES)[number];
