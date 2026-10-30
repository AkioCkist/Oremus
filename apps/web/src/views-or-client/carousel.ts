// Post carousels. Markup comes from post-card.ejs; posts added by infinite scroll work without setup because everything is delegated.

function paint(carousel: Element, track: HTMLElement) {
  const slides = track.children.length;
  const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
  const count = carousel.querySelector('[data-carousel-count]');
  if (count) count.textContent = `${index + 1}/${slides}`;
  carousel.querySelector<HTMLButtonElement>('[data-carousel-nav="-1"]')!.disabled = index <= 0;
  carousel.querySelector<HTMLButtonElement>('[data-carousel-nav="1"]')!.disabled = index >= slides - 1;
  // The dots live in the action row under the photo, so they are found through the post.
  carousel.closest('[data-post-id]')?.querySelectorAll('[data-carousel-dots] > *').forEach((dot, i) => dot.classList.toggle('carousel-dot-on', i === index));
}

let frame = 0;
document.addEventListener('scroll', (event) => {
  const track = event.target;
  if (!(track instanceof HTMLElement) || !track.matches('[data-carousel-track]')) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => { const carousel = track.closest('[data-carousel]'); if (carousel) paint(carousel, track); });
}, { capture: true, passive: true });

document.addEventListener('click', (event) => {
  const target = event.target as Element;
  const nav = target.closest<HTMLButtonElement>('[data-carousel-nav]');
  if (nav) {
    const track = nav.closest('[data-carousel]')?.querySelector('[data-carousel-track]');
    track?.scrollBy({ left: Number(nav.dataset.carouselNav) * track.clientWidth, behavior: 'smooth' });
    return;
  }
  const more = target.closest<HTMLElement>('[data-caption-more]');
  if (more) { more.previousElementSibling?.classList.remove('post-caption-clamp'); more.remove(); }
});
