// Shell dialogs are opened by commands (often from a menu item that unmounts as the menu
// closes), so Radix has no trigger to return focus to and would drop it on <body>. The
// WAI-ARIA dialog pattern requires focus to go back to the invoking control.

let returnTarget: HTMLElement | null = null

/** Call when a command opens a dialog: remembers the open menu's trigger, or the focus. */
export function rememberDialogReturnFocus(): void {
  const openMenuTrigger = document.querySelector<HTMLElement>(
    '[role="menubar"] [role="menuitem"][data-state="open"]'
  )
  const active = document.activeElement
  returnTarget =
    openMenuTrigger ?? (active instanceof HTMLElement && active !== document.body ? active : null)
}

/** `onCloseAutoFocus` handler for shell dialogs. */
export function restoreDialogFocus(event: Event): void {
  const target = returnTarget
  returnTarget = null
  if (target?.isConnected) {
    event.preventDefault()
    target.focus()
  }
}
