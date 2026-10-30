export const CLAY = '#d97757'
export const AMBER = '#fbbf24'
export const RED = '#f87171'
export const MUTED = '#8b8a99'
export const ROW_HOVER = 'rgba(255,255,255,0.045)'

const TYPE_COLORS: Record<string, string> = {
  Explore: '#2dd4bf',
  'general-purpose': '#a78bfa',
  Plan: '#60a5fa',
  claude: '#f472b6',
}
const PALETTE = ['#34d399', '#f472b6', '#38bdf8', '#fb923c', '#e879f9', '#facc15']

const hash = (text: string) => [...text].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7)

/** One steady colour per agent type: the built-in ones fixed, any other hashed. */
export const typeColor = (type: string): string =>
  TYPE_COLORS[type] ?? PALETTE[hash(type) % PALETTE.length] ?? '#a78bfa'
