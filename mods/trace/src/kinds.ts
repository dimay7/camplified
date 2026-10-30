/** What a tool call is, for its colour on the chart. */
export type Kind = 'read' | 'bash' | 'edit' | 'web' | 'agent' | 'mcp' | 'other'

const KINDS: Record<string, Kind> = {
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  LS: 'read',
  NotebookRead: 'read',
  Bash: 'bash',
  BashOutput: 'bash',
  KillShell: 'bash',
  PowerShell: 'bash',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'agent',
  Task: 'agent',
}

export const kindOf = (tool: string): Kind => KINDS[tool] ?? (tool.startsWith('mcp__') ? 'mcp' : 'other')

export const KIND_COLORS: Record<Kind, string> = {
  read: '#2dd4bf',
  bash: '#fbbf24',
  edit: '#a78bfa',
  web: '#38bdf8',
  agent: '#d97757',
  mcp: '#f472b6',
  other: '#8b8a99',
}

export const KIND_LABELS: Record<Kind, string> = {
  read: 'read / search',
  bash: 'bash',
  edit: 'edit / write',
  web: 'web',
  agent: 'agent',
  mcp: 'MCP',
  other: 'other',
}

export const ERROR_COLOR = '#f87171'
export const QUIET_COLOR = '#fbbf24'
export const MAIN_COLOR = '#d97757'

const TYPE_COLORS: Record<string, string> = {
  main: MAIN_COLOR,
  Explore: '#2dd4bf',
  'general-purpose': '#a78bfa',
  Plan: '#60a5fa',
  claude: '#f472b6',
}
const PALETTE = ['#34d399', '#f472b6', '#38bdf8', '#fb923c', '#e879f9', '#facc15']
const hash = (text: string) => [...text].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7)

/** The lane's dot: the same colour per agent type as the agents mod uses. */
export const typeColor = (type: string): string =>
  TYPE_COLORS[type] ?? PALETTE[hash(type) % PALETTE.length] ?? '#a78bfa'
