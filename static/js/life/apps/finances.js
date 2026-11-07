// static/js/life/apps/finances.js — app Finances do hub Life (o painel de static/js/finance.js, embutido).
import { mountFinances } from '../../finance.js';

export const mount = (host, hub) => mountFinances(host, hub);
