/**
 * Soft decorative background used across pages.
 * Subtle blue leaf/shape motifs on a near-white surface.
 * Pointer-events disabled so it never interferes with UI.
 */
export function PageBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      {/* soft blue wash */}
      <div className="absolute inset-0 bg-gradient-to-b from-accent/40 via-background to-background" />

      {/* left leaves */}
      <svg
        className="absolute -left-16 top-24 h-[420px] w-[420px] text-primary/10 animate-fade-in"
        viewBox="0 0 200 200"
        fill="none"
      >
        <path
          d="M40 160 C 60 100, 110 60, 170 50 C 150 110, 110 150, 40 160 Z"
          fill="currentColor"
        />
        <path
          d="M55 165 C 75 120, 115 90, 165 80"
          stroke="currentColor"
          strokeOpacity="0.6"
          strokeWidth="1.5"
        />
      </svg>

      {/* right leaves */}
      <svg
        className="absolute -right-20 bottom-10 h-[460px] w-[460px] text-primary/10 animate-fade-in"
        viewBox="0 0 200 200"
        fill="none"
      >
        <path
          d="M160 40 C 140 100, 90 140, 30 150 C 50 90, 90 50, 160 40 Z"
          fill="currentColor"
        />
        <path
          d="M145 45 C 125 90, 85 120, 35 130"
          stroke="currentColor"
          strokeOpacity="0.6"
          strokeWidth="1.5"
        />
      </svg>

      {/* floating dots */}
      <div className="absolute left-[12%] top-[40%] size-2 rounded-full bg-primary/30 animate-pulse" />
      <div className="absolute right-[18%] top-[28%] size-1.5 rounded-full bg-primary/30 animate-pulse" />
      <div className="absolute left-[48%] bottom-[18%] size-1.5 rounded-full bg-primary/20 animate-pulse" />

      {/* sparkle */}
      <svg
        className="absolute right-[8%] top-[18%] size-6 text-primary/30 animate-pulse"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
      </svg>
    </div>
  );
}
