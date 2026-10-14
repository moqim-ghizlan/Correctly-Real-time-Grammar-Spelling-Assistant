import { MENU_ID } from '../shared/constants';
export function createContextMenu(): void {
  chrome.contextMenus.create(
    {
      id: MENU_ID,
      title: 'Correctly : Corriger',
      contexts: ['editable'],
      visible: false,
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
}
export async function updateContextMenu(
  suggestion: string | undefined,
): Promise<void> {
  await chrome.contextMenus.update(MENU_ID, {
    title:
      suggestion !== undefined
        ? 'Correctly : Corriger en « ' +
          (suggestion || 'Supprimer').slice(0, 80).replaceAll('%', '％') +
          ' »'
        : 'Correctly : Corriger',
    visible: suggestion !== undefined,
    enabled: suggestion !== undefined,
  });
}
export async function handleContextClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (info.menuItemId !== MENU_ID || tab?.id === undefined) return;
  await chrome.tabs.sendMessage(
    tab.id,
    { type: 'apply-context' },
    { frameId: info.frameId ?? 0 },
  );
}
