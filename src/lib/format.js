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
export const OTHER = '#6b6a65'
export const MGMT_COLOR = SERIES[0]
export const IC_COLOR = SERIES[1]

// Sequential blue ramp, light -> dark
export const BLUE_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
export const short = (v) => compact.format(v)

// Black or white text, whichever contrasts more with a hex background
export function onColor(hex) {
  const lum = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#0b0b0b' : '#ffffff'
}

// Mix a hex colour with white; `amount` is how much of the colour remains
export function tint(hex, amount) {
  const mix = (i) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * amount)
  return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, '0')).join('')}`
}
