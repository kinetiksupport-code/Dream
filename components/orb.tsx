/**
 * Dream Orb, copied from the Claude Design canvas (docs/design/claude-design).
 * Do not redraw: geometry and brand colours are fixed. Moods only use
 * transform and opacity (globals.css › «Estilo nuevo» › Orb moods):
 * - `pulsing`: the nucleus pulses while Dream thinks or checks an answer;
 * - `breathing`: the whole Orb breathes slowly at rest (mascot screens);
 * - `reaction`: a one-off hop on success or a small shake on error. Change
 *   `reactionKey` to play it again. Reduced motion: no movement.
 */
export type OrbReaction = "success" | "error";

export function Orb({
  size = 32,
  pulsing = false,
  breathing = false,
  reaction,
  reactionKey,
  className,
}: {
  size?: number;
  pulsing?: boolean;
  breathing?: boolean;
  reaction?: OrbReaction | null;
  reactionKey?: string | number;
  className?: string;
}) {
  const classes = [
    "orb",
    pulsing && "orb-pulsing",
    breathing && "orb-breathing",
    reaction && `orb-${reaction}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <svg
      // A new key restarts the one-off reaction animation.
      key={reaction ? `${reaction}-${reactionKey ?? ""}` : undefined}
      className={classes}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <g className="orb-body">
        <circle cx="32" cy="32" r="30" fill="#155BFF" />
        <g transform="rotate(-25 32 32)">
          <ellipse
            cx="32"
            cy="32"
            rx="22"
            ry="13"
            fill="none"
            stroke="#C8F560"
            strokeWidth="5"
          />
        </g>
        <ellipse
          className="orb-nucleus"
          cx="31"
          cy="33"
          rx="7.5"
          ry="6.5"
          fill="#C8F560"
        />
        <circle cx="51.9" cy="22.7" r="4.8" fill="#FFFFFF" />
      </g>
    </svg>
  );
}
