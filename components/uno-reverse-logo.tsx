/**
 * Uno-style reverse medallion: red tilted oval + white arrows.
 * Arrow geometry from Wikimedia UNO_cards_deck.svg (CC0).
 */
type UnoReverseLogoProps = {
  className?: string;
  title?: string;
};

export function UnoReverseLogo({
  className,
  title = "GitReverse",
}: UnoReverseLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g transform="translate(50 50) scale(1.12) translate(-690 -377.36218)">
        <ellipse
          cx="690"
          cy="377.36218"
          rx="36"
          ry="23"
          transform="rotate(-52 690 377.36218)"
          fill="#d31611"
          stroke="#b0120e"
          strokeWidth="1.1"
        />
        <path
          fill="#ffffff"
          stroke="#141414"
          strokeWidth="0.65"
          strokeLinejoin="round"
          d="m 690,361.11217 2.5,2.5 -10,10 c -2.5,2.5 -2.5,7.5 0,10 l 5,-5 10,-10 2.5,2.5 0,-10 z"
        />
        <path
          fill="#ffffff"
          stroke="#141414"
          strokeWidth="0.65"
          strokeLinejoin="round"
          d="m 690,393.61217 -2.5,-2.5 10,-10 c 2.5,-2.5 2.5,-7.5 0,-10 l -5,5 -10,10 -2.5,-2.5 0,10 z"
        />
      </g>
    </svg>
  );
}
