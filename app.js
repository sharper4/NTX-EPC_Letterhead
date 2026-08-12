(function () {
  'use strict';

  const toggleBtn = document.getElementById('toggle-customer');
  const customerFields = document.getElementById('customer-fields');
  const printBtn = document.getElementById('print-page');
  const editor = document.getElementById('letter-body');
  const toolbar = document.querySelector('.editor-toolbar');

  toggleBtn.addEventListener('click', () => {
    const willShow = customerFields.hidden;
    customerFields.hidden = !willShow;
    toggleBtn.setAttribute('aria-expanded', String(willShow));
    if (willShow) document.getElementById('customer-name').focus();
  });

  printBtn.addEventListener('click', () => window.print());

  toolbar.addEventListener('mousedown', (event) => {
    // Keep the caret in the editor when a toolbar button is pressed.
    if (event.target.closest('button')) event.preventDefault();
  });

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-command]');
    if (!button) return;

    editor.focus();
    const command = button.dataset.command;
    const value = button.dataset.value || null;
    document.execCommand(command, false, value);
  });

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      document.execCommand('insertText', false, '    ');
    }
  });

  // Paste as plain text so pasted content adopts the letterhead styling.
  editor.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
})();
