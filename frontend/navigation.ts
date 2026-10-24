const homeListeners = new Set<() => void>();
export function requestNewsroomHome() { homeListeners.forEach(listener => listener()); }
export function onNewsroomHome(listener: () => void) {
  homeListeners.add(listener);
  return () => { homeListeners.delete(listener); };
}

export interface TopControl { run: () => void }
let topControl: TopControl | undefined;
const topListeners = new Set<(control: TopControl | undefined) => void>();
export function publishTopControl(control?: TopControl) {
  if (Boolean(control) === Boolean(topControl)) return;
  topControl = control;
  topListeners.forEach(listener => listener(control));
}
export function onTopControl(listener: (control: TopControl | undefined) => void) {
  topListeners.add(listener); listener(topControl);
  return () => { topListeners.delete(listener); };
}
