import type { GradeId } from './grades';
export type { GradeId };
export type QuestionKind =
  | 'pick-picture'
  | 'listen-pick'
  | 'letter-tiles'
  | 'pick-word'
  | 'dialogue-choice';

export interface Question {
  id: string;
  grade: GradeId;
  kind: QuestionKind;
  wordId?: string;
  promptJa: string;
  promptEn?: string;
  speakEn?: string;
  imageId?: string;
  choices?: { id: string; textEn?: string; imageId?: string }[];
  answer: string;
  source: { name: string; license: string; url?: string; author?: string };
}

export interface WordProgress {
  wordId: string;
  box: 1 | 2 | 3 | 4 | 5;
  dueDate: string;
  seen: number;
  wrong: number;
}

export interface DayState {
  dateKey: string;
  playSeconds: number;
}

export interface Settings {
  dailyLimitSeconds: number;
  pinHash?: string;
  pinSalt?: string;
  currentGrade?: GradeId;
}

export interface BackupV1 {
  version: 1;
  exportedAt: string;
  progress: WordProgress[];
  bells: number;
  owned: string[];
  placed: { decorId: string; x: number; y: number }[];
  day: DayState;
  daysLog: DayState[];
  settings: Settings;
}
