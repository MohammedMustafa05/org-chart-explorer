import { reactive } from 'vue'

// One shared tooltip for every chart: marks call showTip() on hover, hideTip() on leave.
export const tip = reactive({ visible: false, x: 0, y: 0, title: '', rows: [] })

export function showTip(event, title, rows = []) {
  tip.visible = true
  tip.x = event.clientX
  tip.y = event.clientY
  tip.title = title
  tip.rows = rows
}

export function hideTip() {
  tip.visible = false
}
