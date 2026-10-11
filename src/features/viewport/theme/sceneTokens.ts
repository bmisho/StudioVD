// The only place 3D code gets colours from (CLAUDE.md §7: no hex values in components).
// CSS custom properties in src/styles/globals.css stay the single source of truth.

export const SCENE_TOKEN_VARS = {
  viewportTop: "--viewport-top",
  viewportBottom: "--viewport-bottom",
  highlight: "--highlight-3d",
  gridMinor: "--grid-minor",
  gridMajor: "--grid-major",
  axisX: "--axis-x",
  axisY: "--axis-y",
  axisZ: "--axis-z",
  surface: "--background",
  text: "--foreground",
  hover: "--accent",
  stroke: "--input",
} as const

export type SceneTokens = { readonly [K in keyof typeof SCENE_TOKEN_VARS]: string }

// Production CSS minifies #ffffff to #fff, and a minifier may emit a named colour.
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]+)$/i

export function parseSceneTokens(read: (cssVar: string) => string): SceneTokens {
  const entries = Object.entries(SCENE_TOKEN_VARS).map(([key, cssVar]) => {
    const value = read(cssVar).trim()
    if (!COLOR.test(value))
      throw new Error(`Theme token ${cssVar} is missing or not a colour: "${value}"`)
    return [key, value] as const
  })
  return Object.fromEntries(entries) as SceneTokens
}

let cached: SceneTokens | null = null

/** Light-only theme, so one read is enough. Needs globals.css loaded (main.tsx imports it). */
export function readSceneTokens(): SceneTokens {
  cached ??= parseSceneTokens((name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name)
  )
  return cached
}
