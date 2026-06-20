// Three SVG displacement filters that warp text glyph outlines — one per boil frame. Same
// fractal-noise frequency, three different seeds → three distinct structural wiggles. A Text
// node's sceneFunc selects #wiggle-filter-{animT} so the letters morph between fixed warps as
// useWiggle cycles the frame. Rendered once near the canvas; referenced by canvas ctx.filter.
const SEEDS = [10, 45, 85]

export function WiggleFilters() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', width: 0, height: 0 }}
      aria-hidden
    >
      <defs>
        {SEEDS.map((seed, i) => (
          <filter key={i} id={`wiggle-filter-${i}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.04"
              numOctaves="2"
              seed={seed}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="3"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        ))}
      </defs>
    </svg>
  )
}
