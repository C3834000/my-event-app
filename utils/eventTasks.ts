import { AppEvent, Task } from '../types';

/**
 * קישור משימות לאירועים.
 * המקור הוא task.eventId. אירועים ישנים שמרו משימה אחת ב-event.taskId — גם הם נספרים.
 */
export function tasksForEvent(tasks: Task[], event: AppEvent): Task[] {
  return tasks.filter((t) => t.eventId === event.id || (!!event.taskId && t.id === event.taskId && !t.eventId));
}

export function eventForTask(events: AppEvent[], task: Task): AppEvent | undefined {
  if (task.eventId) return events.find((e) => e.id === task.eventId);
  return events.find((e) => e.taskId === task.id);
}
