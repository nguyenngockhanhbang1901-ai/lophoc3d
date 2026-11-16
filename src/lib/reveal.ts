/**
 * Presentation reveal: content that is not yet shown stays mounted. In presentation mode it is
 * invisible but keeps its space, so each Enter never shifts the slide; elsewhere it is removed
 * from the layout exactly as before (see [data-reveal] in styles.css).
 */
export function reveal(show: boolean) {
  return { 'data-reveal': show ? 'shown' : 'hidden', 'aria-hidden': show ? undefined : true } as const;
}
