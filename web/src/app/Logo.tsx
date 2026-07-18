interface Props {
  size?: number;
}

/**
 * Zendai mark: an ensō (the hand-drawn zen circle, never fully closed) whose
 * gap reads as a blinking code cursor — zen circle meets code cursor. The
 * stroke tapers toward the opening to mimic a single brush pass instead of a
 * uniform ring.
 */
export function Logo({ size = 22 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M38.5 13.5C41.4 17.3 43 21.9 43 27C43 36.4 35.4 44 26 44C16.6 44 9 36.4 9 27C9 17.6 16.6 10 26 10C29.7 10 33 11.1 35.8 13"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="30.5" y="12" width="8" height="8" rx="2" fill="var(--accent)" />
    </svg>
  );
}
