(function () {
  var carousel = document.getElementById('e34-carousel');
  if (!carousel) return;

  var slides = carousel.querySelectorAll('.e34-carousel-slide');
  var prevBtn = document.querySelector('.e34-carousel-prev');
  var nextBtn = document.querySelector('.e34-carousel-next');
  var dots = document.querySelectorAll('.e34-carousel-dot');

  function currentIndex() {
    return Math.round(carousel.scrollLeft / carousel.clientWidth);
  }

  function goTo(index) {
    var clamped = Math.max(0, Math.min(index, slides.length - 1));
    slides[clamped].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function updateDots() {
    var idx = currentIndex();
    dots.forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === idx);
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', function () { goTo(currentIndex() - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { goTo(currentIndex() + 1); });
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goTo(i); });
  });

  carousel.addEventListener('scroll', function () {
    window.requestAnimationFrame(updateDots);
  });

  updateDots();
})();
