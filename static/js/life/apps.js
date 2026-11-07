// static/js/life/apps.js — apps do hub Life, na ordem do trilho. Finances e AI usage carregam sob demanda.
import { mountDiary } from './apps/diary.js';

export const APPS = [
  { id: 'diary', label: 'Diary', icon: 'calendar', mount: mountDiary },
  { id: 'finances', label: 'Finances', icon: 'money', mount: (host, hub) => import('./apps/finances.js').then(m => m.mount(host, hub)) },
  { id: 'ai', label: 'AI usage', icon: 'work', mount: (host, hub) => import('./apps/ai.js').then(m => m.mount(host, hub)) },
];

export const appById = id => APPS.find(a => a.id === id) || null;
