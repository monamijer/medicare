// Notifications (dismiss, auto-dismiss) and confirmation dialog for forms with data-confirm.
// Must be loaded before forms.js so a pending confirmation cancels the loading state.
(function () {
  document.addEventListener('click', function (event) {
    var close = event.target.closest('[data-dismiss]');
    if (!close) return;
    var alert = close.closest('.alert');
    if (alert) alert.remove();
  });

  document.querySelectorAll('.alert[data-autodismiss]').forEach(function (alert) {
    setTimeout(function () { alert.remove(); }, 6000);
  });

  var dialog = document.getElementById('confirm-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  var pending = null;

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form.dataset.confirm || form.dataset.confirmed) return;
    event.preventDefault();
    pending = form;
    document.getElementById('confirm-title').textContent = form.dataset.confirmTitle || 'Confirmer';
    document.getElementById('confirm-message').textContent = form.dataset.confirm;
    document.getElementById('confirm-accept').textContent = form.dataset.confirmLabel || 'Confirmer';
    dialog.returnValue = '';
    dialog.showModal();
  });

  dialog.addEventListener('close', function () {
    var form = pending;
    pending = null;
    if (dialog.returnValue !== 'confirm' || !form) return;
    form.dataset.confirmed = 'true';
    if (form.requestSubmit) form.requestSubmit();
    else form.submit();
  });
})();
