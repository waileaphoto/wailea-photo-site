// session-tile-slider.js — small manual (arrows-only, no autoplay) image slider.
// Reusable: drop a `.tile-slider` block with multiple `<figure>` slides plus
// `.tile-prev`/`.tile-next` buttons inside any element with `[data-tile-slider]`
// (e.g. the pricing.html session tiles or the homepage family-story image) and
// this wires it up automatically. Tiles with only one slide, or no `.tile-slider`
// at all, are left untouched.
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-tile-slider]').forEach((tile) => {
      const figures = Array.from(tile.querySelectorAll('.tile-slider > figure'));
      const prevBtn = tile.querySelector('.tile-prev');
      const nextBtn = tile.querySelector('.tile-next');
      if (figures.length <= 1 || !prevBtn || !nextBtn) return;

      let index = Math.max(0, figures.findIndex((f) => f.classList.contains('active')));

      function show(nextIndex) {
        figures[index].classList.remove('active');
        index = (nextIndex + figures.length) % figures.length;
        figures[index].classList.add('active');
      }

      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        show(index - 1);
      });
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        show(index + 1);
      });
    });
  });
})();
