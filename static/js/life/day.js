// static/js/life/day.js — stub da Task 8 (substituído na Task 9).
import { emptyState } from './parts.js';

export async function renderDay(body) {
  body.innerHTML = emptyState('life', 'Day view', 'Coming in the next task.');
}
