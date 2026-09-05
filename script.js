// Research tree – click a tag to expand the panel beneath it.
(function () {
  const leaves = document.querySelectorAll(".rm-leaf");
  let activeLeaf = null;

  leaves.forEach(function (leaf) {
    const tag = leaf.querySelector(".rm-tag");
    if (!tag) return;
    tag.addEventListener("click", function (e) {
      e.stopPropagation();
      if (activeLeaf === leaf) {
        leaf.classList.remove("is-open");
        activeLeaf = null;
        return;
      }
      if (activeLeaf) activeLeaf.classList.remove("is-open");
      leaf.classList.add("is-open");
      activeLeaf = leaf;
    });
  });

  // Click outside to close
  document.addEventListener("click", function (e) {
    if (activeLeaf && !e.target.closest(".rm-leaf")) {
      activeLeaf.classList.remove("is-open");
      activeLeaf = null;
    }
  });

  // Replay line-draw animation when the tree enters the viewport
  const canvas = document.querySelector(".rm-canvas");
  if (canvas) {
    const obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            canvas.classList.add("is-replaying");
            void canvas.offsetHeight;
            canvas.classList.remove("is-replaying");
          }
        });
      },
      { threshold: 0.15 }
    );
    obs.observe(canvas);
  }
})();
