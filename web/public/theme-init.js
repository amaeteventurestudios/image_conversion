// Applied before first paint to avoid a light/dark flash.
(function () {
  var t = null;
  try { t = localStorage.getItem("theme"); } catch (e) {}
  if (!t) t = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  if (t === "dark") document.documentElement.classList.add("dark");
})();
