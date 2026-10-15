export const SHORTCUT_KEY = 'correctly.shortcuts.v1';
export interface TextShortcut {
  id: string;
  trigger: string;
  replacement: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface ShortcutSettings {
  schemaVersion: 1;
  enabled: boolean;
  shortcuts: TextShortcut[];
}
export const EMPTY_SHORTCUTS: ShortcutSettings = {
  schemaVersion: 1,
  enabled: true,
  shortcuts: [],
};
export const normalizeTrigger = (value: string) =>
  value.normalize('NFC').toLowerCase();
export function validateShortcuts(value: ShortcutSettings): ShortcutSettings {
  if (
    value.schemaVersion !== 1 ||
    typeof value.enabled !== 'boolean' ||
    !Array.isArray(value.shortcuts) ||
    value.shortcuts.length > 500
  )
    throw new Error('Format de raccourcis invalide (500 maximum).');
  const seen = new Set<string>();
  const ids = new Set<string>();
  const shortcuts = value.shortcuts.map((entry) => {
    if (
      !entry ||
      typeof entry.trigger !== 'string' ||
      typeof entry.replacement !== 'string'
    )
      throw new Error('Raccourci invalide.');
    const trigger = entry.trigger.trim().normalize('NFC');
    if (
      !/^[\p{L}\p{M}\p{N}_-]{1,32}$/u.test(trigger) ||
      entry.replacement.length < 1 ||
      entry.replacement.length > 2000 ||
      [...entry.replacement].some((character) => {
        const code = character.charCodeAt(0);
        return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
      })
    )
      throw new Error(
        'Abréviation : 1–32 lettres/chiffres ; remplacement : 1–2000 caractères.',
      );
    const key = normalizeTrigger(trigger);
    if (seen.has(key)) throw new Error('Cette abréviation existe déjà.');
    if (
      typeof entry.id !== 'string' ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.enabled !== 'boolean' ||
      !Number.isFinite(entry.createdAt) ||
      !Number.isFinite(entry.updatedAt)
    )
      throw new Error('Métadonnées de raccourci invalides.');
    seen.add(key);
    ids.add(entry.id);
    return { ...entry, trigger };
  });
  return { schemaVersion: 1, enabled: value.enabled, shortcuts };
}
export async function loadShortcuts(): Promise<ShortcutSettings> {
  const data = await chrome.storage.local.get(SHORTCUT_KEY);
  return data[SHORTCUT_KEY] === undefined
    ? { ...EMPTY_SHORTCUTS, shortcuts: [] }
    : validateShortcuts(data[SHORTCUT_KEY] as ShortcutSettings);
}
export async function saveShortcuts(
  value: ShortcutSettings,
  expected?: ShortcutSettings,
) {
  const write = async () => {
    let next = validateShortcuts(value);
    if (expected) {
      const latest = await loadShortcuts();
      const fields = (entry: TextShortcut | undefined) =>
        entry && [
          entry.id,
          entry.trigger,
          entry.replacement,
          entry.enabled,
          entry.createdAt,
          entry.updatedAt,
        ];
      const same = (a: TextShortcut | undefined, b: TextShortcut | undefined) =>
        JSON.stringify(fields(a)) === JSON.stringify(fields(b));
      const changed = new Set(
        [...expected.shortcuts, ...next.shortcuts]
          .map((s) => s.id)
          .filter(
            (id) =>
              !same(
                expected.shortcuts.find((s) => s.id === id),
                next.shortcuts.find((s) => s.id === id),
              ),
          ),
      );
      for (const id of changed) {
        if (
          !same(
            expected.shortcuts.find((s) => s.id === id),
            latest.shortcuts.find((s) => s.id === id),
          )
        )
          throw new Error(
            'Ce raccourci a changé dans une autre fenêtre. Rechargez les paramètres.',
          );
      }
      if (
        next.enabled !== expected.enabled &&
        latest.enabled !== expected.enabled
      )
        throw new Error(
          'Le réglage a changé dans une autre fenêtre. Rechargez les paramètres.',
        );
      next = validateShortcuts({
        ...latest,
        enabled:
          next.enabled === expected.enabled ? latest.enabled : next.enabled,
        shortcuts: [
          ...latest.shortcuts.filter((s) => !changed.has(s.id)),
          ...next.shortcuts.filter((s) => changed.has(s.id)),
        ],
      });
    }
    await chrome.storage.local.set({ [SHORTCUT_KEY]: next });
    return next;
  };
  // Extension option pages share an origin; Web Locks serializes read/merge/write
  // across tabs without persisting any page text or introducing a background DB.
  return navigator.locks
    ? navigator.locks.request(SHORTCUT_KEY, write)
    : write();
}
