import { useEffect, useState } from "react";

// Whole seconds left until `deadline` (a Date.now() time), updated a few times a second.
// Null when there's no countdown.
export function useSecondsLeft(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

// The server sends "ends in X ms"; turn that into a clock time using when the message arrived
export function deadlineFrom(receivedAt: number | undefined, msLeft: number | null | undefined) {
  if (msLeft === null || msLeft === undefined || receivedAt === undefined) return null;
  return receivedAt + msLeft;
}
