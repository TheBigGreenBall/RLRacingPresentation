/** A slide animation: built once per <section data-anim>, replayed every time the slide is shown. */
export interface SlideAnim {
  play(): void;
  stop(): void;
}
