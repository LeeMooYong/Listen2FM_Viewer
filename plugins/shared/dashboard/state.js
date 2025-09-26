// plugins/shared/dashboard/state.js
// 대시보드 전역 상태: 기간(5D/20D/60D), 스케일모드(auto/common), 정렬모드(fixed/retDesc/retAsc/volDesc)

const PERIODS = new Set(['5D', '20D', '60D']);
let _period = '5D';

const SCALE_MODES = new Set(['auto', 'common']);  // auto=개별 스케일, common=공통 스케일
let _scale = 'auto';

// ✅ 정렬 모드에 'fixed' 추가, 기본값도 'fixed'
const SORT_MODES = ['fixed', 'retDesc', 'retAsc', 'volDesc']; // 고정, 수익률↓, 수익률↑, 변동성↓
let _sort = 'fixed';

const subs = {
  period: new Set(),
  scale: new Set(),
  sort: new Set(),
};

// ── getters
export const getPeriod = () => _period;
export const getScaleMode = () => _scale;
export const getSortMode = () => _sort;

// ── setters (+ 이벤트 브로드캐스트)
export function setPeriod(next) {
  if (!PERIODS.has(next)) return;
  if (next === _period) return;
  _period = next;
  subs.period.forEach(fn => { try { fn(_period); } catch { } });
  try { window.dispatchEvent(new CustomEvent('l2fm:db:period', { detail: { period: _period } })); } catch { }
}
export function setScaleMode(next) {
  if (!SCALE_MODES.has(next)) return;
  if (next === _scale) return;
  _scale = next;
  subs.scale.forEach(fn => { try { fn(_scale); } catch { } });
  try { window.dispatchEvent(new CustomEvent('l2fm:db:scale', { detail: { scale: _scale } })); } catch { }
}
export function setSortMode(next) {
  if (!SORT_MODES.includes(next)) return;
  if (next === _sort) return;
  _sort = next;
  subs.sort.forEach(fn => { try { fn(_sort); } catch { } });
  try { window.dispatchEvent(new CustomEvent('l2fm:db:sort', { detail: { sort: _sort } })); } catch { }
}
export function cycleSortMode() {
  const idx = SORT_MODES.indexOf(_sort);
  const next = SORT_MODES[(idx + 1) % SORT_MODES.length];
  setSortMode(next);
  return _sort;
}

// ── subscriptions
export const onPeriodChange = (fn) => (subs.period.add(fn), () => subs.period.delete(fn));
export const onScaleChange = (fn) => (subs.scale.add(fn), () => subs.scale.delete(fn));
export const onSortChange = (fn) => (subs.sort.add(fn), () => subs.sort.delete(fn));

// ── window 헬퍼
if (typeof window !== 'undefined') {
  window.L2FM_getDashboardPeriod = getPeriod;
  window.L2FM_setDashboardPeriod = setPeriod;

  window.L2FM_getDashboardScale = getScaleMode;
  window.L2FM_toggleDashboardScale = () => setScaleMode(getScaleMode() === 'auto' ? 'common' : 'auto');

  window.L2FM_getDashboardSort = getSortMode;
  window.L2FM_cycleDashboardSort = cycleSortMode;
}

export default {
  getPeriod, setPeriod, onPeriodChange,
  getScaleMode, setScaleMode, onScaleChange,
  getSortMode, setSortMode, onSortChange, cycleSortMode
};
