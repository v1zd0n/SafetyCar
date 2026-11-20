import type { MouseEvent } from 'react'

const transitionKey = 'safetycar-demo-transition'

export function goToDemo(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (document.body.classList.contains('demo-exiting')) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.location.assign('/demo')
    return
  }
  try { window.sessionStorage.setItem(transitionKey, '1') } catch { /* Private browsing may block storage. */ }
  document.body.classList.add('demo-exiting')
  window.setTimeout(() => window.location.assign('/demo'), 620)
}

export function hasDemoTransition() {
  try {
    return window.sessionStorage.getItem(transitionKey) === '1'
  } catch {
    return false
  }
}

export function clearDemoTransition() {
  try { window.sessionStorage.removeItem(transitionKey) } catch { /* No storage available. */ }
}
