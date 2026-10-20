// 5.16 language menus, shared by the modal, the right-click panel, the 5.15
// bubble and the settings page: one way to fill a <select> from the catalog
// (favorites group first) and its variant <select> for the chosen target.
import {
  languageOptions,
  variantOptions,
  type CommonMessages,
  type MenuGroup,
  type MenuItem,
} from './i18n';
import {
  isLanguageId,
  variantFor,
  type LanguageId,
  type TargetVariants,
  type VariantId,
} from './translate';

/** Replaces the options with plain items and/or option groups. */
export function fillSelect(
  select: HTMLSelectElement,
  entries: readonly (MenuItem | MenuGroup)[],
  value: string,
): void {
  const doc = select.ownerDocument;
  const option = (item: MenuItem) => {
    const node = doc.createElement('option');
    node.value = item.id;
    node.textContent = item.label;
    return node;
  };
  select.replaceChildren(
    ...entries.map((entry) => {
      if (!('items' in entry)) return option(entry);
      const group = doc.createElement('optgroup');
      group.label = entry.label;
      group.append(...entry.items.map(option));
      return group;
    }),
  );
  select.value = value;
}

/** A language menu: optional lead items, favorites, then all A→Z. */
export function fillLanguages(
  select: HTMLSelectElement,
  common: CommonMessages,
  favorites: readonly LanguageId[],
  value: string,
  lead: readonly MenuItem[] = [],
): void {
  fillSelect(select, [...lead, ...languageOptions(common, favorites)], value);
}

/**
 * The variants of `target`, preselecting `preferred`; returns false (nothing
 * to show) when the target has no variants.
 */
export function fillVariants(
  select: HTMLSelectElement,
  common: CommonMessages,
  target: LanguageId,
  preferred: VariantId | null,
): boolean {
  const items = variantOptions(common, target);
  fillSelect(
    select,
    items,
    items.some((item) => item.id === preferred)
      ? (preferred ?? '')
      : (items[0]?.id ?? ''),
  );
  return items.length > 0;
}

/**
 * Keeps a variant menu in step with its target menu: refilled (or hidden)
 * when the target changes, remembering the variant picked for each language
 * during this session, starting from the saved preferences.
 */
export function linkVariants(
  to: HTMLSelectElement,
  variant: HTMLSelectElement,
  row: HTMLElement,
  common: CommonMessages,
  saved: TargetVariants,
): void {
  const chosen: Partial<Record<LanguageId, VariantId>> = { ...saved };
  let shown = to.value;
  const refill = () => {
    shown = to.value;
    row.hidden = !(
      isLanguageId(shown) &&
      fillVariants(variant, common, shown, chosen[shown] ?? null)
    );
  };
  variant.addEventListener('change', () => {
    const value = isLanguageId(shown) && variantFor(shown, variant.value);
    if (value) chosen[shown as LanguageId] = value;
  });
  to.addEventListener('change', refill);
  refill();
}
