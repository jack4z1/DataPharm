// A tiny LIFO stack of "back" actions (close sheet / modal / sub-view).
// The left-edge swipe gesture in App.jsx calls triggerBack(), which pops the
// most recently opened layer so users can navigate back fluently.

const stack = [];

/** Register a back handler. Returns an unregister function. */
export function registerBack(fn) {
  stack.push(fn);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const i = stack.indexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Run the topmost back handler. Returns true if something was closed. */
export function triggerBack() {
  const fn = stack.pop();
  if (!fn) return false;
  try {
    fn();
  } catch (e) {
    /* ignore handler errors */
  }
  return true;
}
