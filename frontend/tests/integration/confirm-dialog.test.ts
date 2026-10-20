import { afterEach, describe, expect, it } from 'vitest';
import { confirmDialog } from '../../src/options/dialog';

const TEXT = {
  question: 'Supprimer le raccourci « <b>asap</b> » ?',
  confirm: 'Supprimer',
  cancel: 'Annuler',
};
const dialog = () =>
  document.querySelector<HTMLDialogElement>('dialog.confirm-dialog');
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(
    (b) => b.textContent === label,
  )!;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('settings page confirmation dialog (instead of window.confirm)', () => {
  it('shows the question as text, focuses Cancel, resolves true on the action', async () => {
    const answer = confirmDialog(document, TEXT);
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector('p')?.textContent).toBe(TEXT.question);
    expect(dialog()?.querySelector('b')).toBeNull();
    expect(document.activeElement).toBe(button('Annuler'));
    button('Supprimer').click();
    expect(await answer).toBe(true);
    expect(dialog()).toBeNull();
  });

  it('Cancel, Escape and a click on the backdrop all resolve false', async () => {
    let answer = confirmDialog(document, TEXT);
    button('Annuler').click();
    expect(await answer).toBe(false);

    answer = confirmDialog(document, TEXT);
    dialog()!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await answer).toBe(false);

    answer = confirmDialog(document, TEXT);
    dialog()!.click();
    expect(await answer).toBe(false);
    expect(dialog()).toBeNull();
  });
});
