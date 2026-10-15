/**
 * Vrai si la touche est tapée dans un champ de saisie (texte, liste, éditeur),
 * où un raccourci clavier de l'app ne doit pas prendre la main.
 * @param target Cible de l'événement clavier
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]') !== null
}

/**
 * Vrai si la touche est tapée dans un menu, une bulle ou un dialogue ouvert,
 * qui gère lui-même ses touches (recherche par lettre d'un menu, par exemple).
 * @param target Cible de l'événement clavier
 */
export function isInOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="menu"], [role="menubar"], [role="dialog"], [role="alertdialog"]') !== null
  )
}
