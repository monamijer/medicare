// Accessible, dependency-free carousel for the home page.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var carousel = document.querySelector('[data-carousel]');
    if (!carousel) return;
    var slides = Array.from(carousel.querySelectorAll('.feature-slide'));
    var dots = Array.from(document.querySelectorAll('[data-carousel-dot]'));
    var current = 0;
    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        var active = i === current;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
      });
      dots.forEach(function (dot, i) {
        var active = i === current;
        dot.classList.toggle('is-active', active);
        if (active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }
    var previous = document.querySelector('[data-carousel-prev]');
    var next = document.querySelector('[data-carousel-next]');
    if (previous) previous.addEventListener('click', function () { show(current - 1); });
    if (next) next.addEventListener('click', function () { show(current + 1); });
    dots.forEach(function (dot, i) { dot.addEventListener('click', function () { show(i); }); });
    show(0);
  });
})();
