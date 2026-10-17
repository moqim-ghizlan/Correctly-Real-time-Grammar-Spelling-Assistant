// FR/EN switch: every [data-i18n] element gets its text (textContent,
// never HTML), every [data-i18n-attr="attr:key;attr:key"] its attributes.
(function () {
  const { fr, en } = window.CorrectlyData;

  const DICTS = { fr, en };
  const STORE = 'correctly-site.lang';
  const listeners = new Set();
  let lang = document.documentElement.dataset.lang === 'en' ? 'en' : 'fr';

  const getLang = () => lang;

  function t(key, vars) {
    let text = DICTS[lang][key] ?? DICTS.fr[key] ?? key;
    if (vars)
      for (const [name, value] of Object.entries(vars))
        text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }

  const onLangChange = (listener) => listeners.add(listener);

  function apply(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]'))
      el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of el.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr.trim(), t(key.trim()));
      }
    }
    const date = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    for (const el of root.querySelectorAll('time[data-i18n-date]'))
      el.textContent = date.format(new Date(`${el.dateTime}T12:00:00`));
  }

  function setLang(next, persist) {
    lang = next === 'en' ? 'en' : 'fr';
    const html = document.documentElement;
    html.lang = lang;
    html.dataset.lang = lang;
    if (persist) {
      try {
        localStorage.setItem(STORE, lang);
      } catch {
        // Private mode or blocked storage: the choice lasts for this page only.
      }
    }
    apply();
    for (const button of document.querySelectorAll('[data-lang]'))
      button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
    html.classList.remove('i18n-pending');
    for (const listener of listeners) listener(lang);
  }

  function initI18n() {
    for (const button of document.querySelectorAll('[data-lang]')) {
      button.addEventListener('click', () => {
        if (button.dataset.lang === lang) return;
        setLang(button.dataset.lang, true);
        if (document.documentElement.classList.contains('motion'))
          document
            .querySelector('main')
            ?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
              duration: 220,
              easing: 'ease-out',
            });
      });
    }
    setLang(lang, false);
  }

  (window.Correctly ||= {}).i18n = {
    getLang,
    t,
    onLangChange,
    apply,
    initI18n,
  };
})();
