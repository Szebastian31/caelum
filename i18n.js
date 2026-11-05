// Languages, the same set as Consensus Weather, Augur and Kalendae. Caelum opens in your phone's language and
// falls back to English; you can change it in Profile (the app reloads in the new language).
// Texts are written in English in the code: t('Find it'). Each file in i18n/ maps them to one
// language, so a line that isn't translated yet simply shows the English.
// Placeholders: t('Found {name} · tap it to stop', { name }). Star names (Vega, Sirius…) are never translated.
const LANGS = {
  en: ['English', 'en-GB'], pl: ['Polski', 'pl-PL'], de: ['Deutsch', 'de-DE'], uk: ['Українська', 'uk-UA'],
  es: ['Español', 'es-ES'], fr: ['Français', 'fr-FR'], ru: ['Русский', 'ru-RU'], zh: ['中文', 'zh-CN'],
  ja: ['日本語', 'ja-JP'], pt: ['Português', 'pt-BR'], nl: ['Nederlands', 'nl-NL'], it: ['Italiano', 'it-IT'],
  hi: ['हिन्दी', 'hi-IN'], ar: ['العربية', 'ar', 'rtl'], el: ['Ελληνικά', 'el-GR'], cs: ['Čeština', 'cs-CZ'],
  sv: ['Svenska', 'sv-SE'], ko: ['한국어', 'ko-KR'], id: ['Bahasa Indonesia', 'id-ID'], bn: ['বাংলা', 'bn-BD'],
  tr: ['Türkçe', 'tr-TR'], te: ['తెలుగు', 'te-IN'], ro: ['Română', 'ro-RO'], hu: ['Magyar', 'hu-HU'],
  fi: ['Suomi', 'fi-FI'], no: ['Norsk', 'nb-NO'], sk: ['Slovenčina', 'sk-SK'], sw: ['Kiswahili', 'sw-KE'],
  fa: ['فارسی', 'fa-IR', 'rtl'], da: ['Dansk', 'da-DK'], th: ['ไทย', 'th-TH'], vi: ['Tiếng Việt', 'vi-VN'],
  bg: ['Български', 'bg-BG'],
};
// phones report Norwegian as nb (Bokmål) or nn (Nynorsk); both open the Norwegian file
const LANG_ALIAS = { nb: 'no', nn: 'no' };
const I18N = {};
const LANG_KEY = 'caelum-lang';

const LANG = (() => {
  const asked = (location.search.match(/[?&]lang=(\w+)/) || [])[1]; // ?lang=pl, for screenshots in another language
  if (asked && LANGS[asked]) return asked;
  try { const saved = localStorage.getItem(LANG_KEY); if (saved && LANGS[saved]) return saved; } catch (e) {}
  for (const l of navigator.languages || [navigator.language || 'en']) {
    let c = String(l).toLowerCase().split('-')[0];
    c = LANG_ALIAS[c] || c;
    if (LANGS[c]) return c;
  }
  return 'en';
})();
const LOCALE = LANGS[LANG][1];
document.documentElement.lang = LANG;
document.documentElement.dir = LANGS[LANG][2] === 'rtl' ? 'rtl' : 'ltr';
// load just the one language file, before the rest of the app runs
if (LANG !== 'en') document.write(`<script src="i18n/${LANG}.js"><\/script>`);

// plain numbers in the language's own digits (Persian ۴۰, Arabic ٤٠, Bengali ৪০…), no thousands separator so years stay 1476
const int = (n) => new Intl.NumberFormat(LOCALE, { useGrouping: false, maximumFractionDigits: 2 }).format(n);
function fill(s, v) { return v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? (typeof v[k] === 'number' ? int(v[k]) : v[k]) : m)) : s; }
function t(s, v) { return fill((I18N[LANG] && I18N[LANG][s]) || s, v); }
function setLanguage(code) {
  try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
  location.reload();
}
// translates the fixed texts in index.html: data-t="…" for plain text, data-t-html for text with <b> or <br>,
// data-t-title and data-t-aria for labels
function translateStatic(root = document) {
  root.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  root.querySelectorAll('[data-t-html]').forEach(el => { el.innerHTML = t(el.dataset.tHtml); });
  root.querySelectorAll('[data-t-title]').forEach(el => el.setAttribute('title', t(el.dataset.tTitle)));
  root.querySelectorAll('[data-t-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.tAria)));
  root.querySelectorAll('[data-t-ph]').forEach(el => el.setAttribute('placeholder', t(el.dataset.tPh)));
}
