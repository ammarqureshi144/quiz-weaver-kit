import { useEffect, useState } from "react";

// Computes a stable "now" anchored to a server-provided timestamp at mount.
// Ticks every second; returns seconds remaining until endTime.
export function useServerCountdown(serverNowIso: string | null, endTimeIso: string | null) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!serverNowIso || !endTimeIso) return;
    const serverNow = new Date(serverNowIso).getTime();
    const end = new Date(endTimeIso).getTime();
    const clientStart = Date.now();

    const tick = () => {
      const elapsed = Date.now() - clientStart;
      const effectiveNow = serverNow + elapsed;
      setRemaining(Math.max(0, Math.round((end - effectiveNow) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [serverNowIso, endTimeIso]);

  return remaining;
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
