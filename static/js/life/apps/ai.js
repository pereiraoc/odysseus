// static/js/life/apps/ai.js — stub da Task 2 (substituído na Task 4).
import { emptyState } from '../parts.js';

export async function mount(host) {
  host.innerHTML = emptyState('work', 'AI usage', 'Coming in the next task.');
  return { route() {}, unmount() {} };
}
