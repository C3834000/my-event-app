import { Task } from '../types';
import { getTopCategory, TopCategoryId } from '../data/tasksSeed';

export const MAX_FOCUS_PER_CATEGORY = 3;

const dayOf = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

/** בפוקוס של היום רק כש-focusDate שווה למפתח היום (YYYY-MM-DD מ-toDateKey). */
export function isFocusToday(task: Task, todayKey: string): boolean {
  return dayOf(task.focusDate) === todayKey;
}

export function getFocusForCategory(tasks: Task[], topCategory: TopCategoryId, todayKey: string): Task[] {
  return tasks.filter((t) => getTopCategory(t.category) === topCategory && isFocusToday(t, todayKey));
}

/** משימות שהושלמו עדיין נספרות באותו יום. */
export function canAddFocus(tasks: Task[], topCategory: TopCategoryId, todayKey: string): boolean {
  return getFocusForCategory(tasks, topCategory, todayKey).length < MAX_FOCUS_PER_CATEGORY;
}
