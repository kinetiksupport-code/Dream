/**
 * Dream Orb, copied from the Claude Design canvas (docs/design/claude-design).
 * Do not redraw: geometry and brand colours are fixed. `pulsing` animates only
 * the nucleus (transform) while Dream thinks or checks an answer.
 */
export function Orb({
  size = 32,
  pulsing = false,
  className,
}: {
  size?: number;
  pulsing?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`orb${pulsing ? " orb-pulsing" : ""}${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
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
    </svg>
  );
}
