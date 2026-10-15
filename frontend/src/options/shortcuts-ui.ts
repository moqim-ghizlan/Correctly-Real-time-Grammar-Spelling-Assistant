import {
  loadShortcuts,
  saveShortcuts,
  validateShortcuts,
  SHORTCUT_KEY,
  type ShortcutSettings,
} from '../shared/shortcuts';
const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const toggle = get<HTMLInputElement>('shortcuts-enabled');
const trigger = get<HTMLInputElement>('shortcut-trigger');
const replacement = get<HTMLTextAreaElement>('shortcut-replacement');
const status = get<HTMLElement>('shortcut-status');
let settings: ShortcutSettings;
let editing: string | undefined;
let busy = false;
function reset() {
  editing = undefined;
  trigger.value = '';
  replacement.value = '';
  trigger.setCustomValidity('');
  get('shortcut-submit').textContent = 'Ajouter';
}
function render() {
  toggle.checked = settings.enabled;
  const list = get('shortcut-list');
  list.replaceChildren();
  for (const entry of settings.shortcuts) {
    const row = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${entry.trigger} → ${entry.replacement}`;
    const active = document.createElement('input');
    active.type = 'checkbox';
    active.checked = entry.enabled;
    active.setAttribute('aria-label', `Activer ${entry.trigger}`);
    active.onchange = () => {
      void persist({
        ...settings,
        shortcuts: settings.shortcuts.map((s) =>
          s.id === entry.id
            ? { ...s, enabled: active.checked, updatedAt: Date.now() }
            : s,
        ),
      });
    };
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Modifier';
    edit.setAttribute('aria-label', `Modifier ${entry.trigger}`);
    edit.onclick = () => {
      editing = entry.id;
      trigger.value = entry.trigger;
      replacement.value = entry.replacement;
      get('shortcut-submit').textContent = 'Enregistrer';
      trigger.focus();
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Supprimer';
    remove.setAttribute('aria-label', `Supprimer ${entry.trigger}`);
    remove.onclick = () => {
      if (window.confirm('Supprimer ce raccourci ?'))
        void persist({
          ...settings,
          shortcuts: settings.shortcuts.filter((s) => s.id !== entry.id),
        });
    };
    row.append(active, text, edit, remove);
    list.append(row);
  }
}
async function persist(next: ShortcutSettings) {
  if (busy) {
    render();
    return false;
  }
  busy = true;
  toggle.disabled = true;
  get<HTMLFieldSetElement>('shortcut-controls').disabled = true;
  try {
    settings = await saveShortcuts(next, settings);
    status.textContent = 'Raccourcis enregistrés.';
    render();
    return true;
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Impossible d’enregistrer.';
    render();
    return false;
  } finally {
    busy = false;
    toggle.disabled = false;
    get<HTMLFieldSetElement>('shortcut-controls').disabled = false;
  }
}
get('shortcut-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const now = Date.now(),
    old = settings.shortcuts.find((s) => s.id === editing);
  const entry = {
    id: old?.id ?? crypto.randomUUID(),
    trigger: trigger.value.trim().normalize('NFC'),
    replacement: replacement.value,
    enabled: old?.enabled ?? true,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
  };
  void persist({
    ...settings,
    shortcuts: old
      ? settings.shortcuts.map((s) => (s.id === old.id ? entry : s))
      : [...settings.shortcuts, entry],
  }).then((ok) => {
    if (ok) reset();
  });
});
get('shortcut-cancel').onclick = reset;
function validateForm() {
  trigger.setCustomValidity('');
  if (!settings || !trigger.value || !replacement.value) return;
  const old = settings.shortcuts.find((s) => s.id === editing);
  const candidate = {
    id: editing ?? '__draft__',
    trigger: trigger.value,
    replacement: replacement.value,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
  try {
    validateShortcuts({
      ...settings,
      shortcuts: old
        ? settings.shortcuts.map((s) => (s.id === editing ? candidate : s))
        : [...settings.shortcuts, candidate],
    });
    status.textContent = '';
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Raccourci invalide.';
    trigger.setCustomValidity(message);
    status.textContent = message;
  }
}
trigger.addEventListener('input', validateForm);
replacement.addEventListener('input', validateForm);
toggle.onchange = () => {
  void persist({ ...settings, enabled: toggle.checked });
};
async function reload() {
  try {
    settings = await loadShortcuts();
    render();
    toggle.disabled = false;
    get<HTMLFieldSetElement>('shortcut-controls').disabled = false;
  } catch {
    status.textContent =
      'Raccourcis illisibles : données conservées. Corrigez ou restaurez le stockage avant de modifier cette liste.';
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SHORTCUT_KEY] && !busy) void reload();
});
void reload();
