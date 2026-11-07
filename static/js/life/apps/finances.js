// static/js/life/apps/finances.js — stub da Task 2 (substituído na Task 3).
import { emptyState } from '../parts.js';

export async function mount(host) {
  host.innerHTML = emptyState('money', 'Finances', 'Coming in the next task.');
  return { route() {}, unmount() {} };
}
