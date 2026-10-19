// A small buzz on phones that support it (Android). iPhones don't let websites vibrate, so this quietly does nothing there.
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers block vibration; that's fine
  }
}
