const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en-US')

export const money = (v) => (v ? `$${compact.format(v)}` : '$0')
export const moneyFull = (v) => `$${whole.format(Math.round(v))}`
export const count = (v) => whole.format(v)
export const ratio = (v) => (v == null ? '—' : `${v.toFixed(2)}×`)
export const pct = (v) => `${Math.round(v * 100)}%`

export function initials(name) {
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// Categorical slots in fixed order (validated palette); departments beyond
// eight fold into neutral "other" ink instead of generating new hues.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
export const OTHER = '#898781'
export const MGMT_COLOR = SERIES[0]
export const IC_COLOR = SERIES[1]

// Sequential blue ramp, light -> dark
export const BLUE_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
export const short = (v) => compact.format(v)
