// Sidebar behaviour. Loaded in <head> so the initial state is set before first paint.
(function () {
  var root = document.documentElement;
  var KEY = 'medicare.sidebar';
  var desktop = window.matchMedia('(min-width: 62rem)');

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(value) { try { localStorage.setItem(KEY, value); } catch (e) { /* storage unavailable */ } }

  // Desktop remembers the choice (open by default); mobile always starts closed.
  function initialState() { return desktop.matches && read() !== 'closed' ? 'open' : 'closed'; }

  root.dataset.sidebar = initialState();

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('sidebar-toggle');
    var backdrop = document.getElementById('sidebar-backdrop');
    if (!toggle) return;

    function set(state) {
      root.dataset.sidebar = state;
      toggle.setAttribute('aria-expanded', String(state === 'open'));
      if (desktop.matches) write(state);
    }

    toggle.setAttribute('aria-expanded', String(root.dataset.sidebar === 'open'));
    toggle.addEventListener('click', function () {
      set(root.dataset.sidebar === 'open' ? 'closed' : 'open');
    });
    if (backdrop) backdrop.addEventListener('click', function () { set('closed'); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !desktop.matches && root.dataset.sidebar === 'open') {
        set('closed');
        toggle.focus();
      }
    });
    desktop.addEventListener('change', function () {
      root.dataset.sidebar = initialState();
      toggle.setAttribute('aria-expanded', String(root.dataset.sidebar === 'open'));
    });
  });
})();
