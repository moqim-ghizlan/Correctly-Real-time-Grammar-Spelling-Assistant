// In-page confirmation for the settings page: a modal <dialog> styled like
// the page, instead of the browser's window.confirm.

export interface ConfirmText {
  question: string;
  /** Label of the button that carries out the action (e.g. "Delete"). */
  confirm: string;
  cancel: string;
}

/** Resolves true only when the action button is chosen. */
export function confirmDialog(
  doc: Document,
  text: ConfirmText,
): Promise<boolean> {
  const dialog = doc.createElement('dialog');
  dialog.className = 'confirm-dialog';
  const question = doc.createElement('p');
  question.textContent = text.question;
  const actions = doc.createElement('div');
  actions.className = 'confirm-actions';
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.className = 'ghost';
  cancel.textContent = text.cancel;
  const confirm = doc.createElement('button');
  confirm.type = 'button';
  confirm.className = 'danger';
  confirm.textContent = text.confirm;
  actions.append(cancel, confirm);
  // The box fills the dialog, so a click on the dialog itself is the backdrop.
  const box = doc.createElement('div');
  box.className = 'confirm-box';
  box.append(question, actions);
  dialog.append(box);
  doc.body.append(dialog);

  return new Promise((resolve) => {
    const close = (answer: boolean) => {
      dialog.close?.();
      dialog.remove();
      resolve(answer);
    };
    cancel.addEventListener('click', () => close(false));
    confirm.addEventListener('click', () => close(true));
    // Escape, or a click on the backdrop around the box.
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close(false);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(false);
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // The safe choice has the focus: Enter never deletes by accident.
    cancel.focus();
  });
}
