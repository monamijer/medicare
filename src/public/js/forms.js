// Loading state: disable the submit button once a form is sent.
document.addEventListener('submit', function (event) {
  if (event.defaultPrevented) return; // e.g. waiting for a confirmation
  var form = event.target;
  var button = form.querySelector('[type="submit"]');
  if (!button || !form.dataset.loadingText) return;
  button.dataset.label = button.textContent;
  button.textContent = form.dataset.loadingText;
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
});

// Restore buttons when the page comes back from the browser cache.
window.addEventListener('pageshow', function (event) {
  if (!event.persisted) return;
  document.querySelectorAll('button[data-label]').forEach(function (button) {
    button.textContent = button.dataset.label;
    button.disabled = false;
    if (button.form) button.form.removeAttribute('aria-busy');
  });
});
