export function resolveLocale({
  queryLocale,
  savedLocale,
  browserLocale = '',
  locales = ['zh-CN', 'zh-HK', 'en'],
} = {}) {
  if (locales.includes(queryLocale)) return queryLocale;
  if (locales.includes(savedLocale)) return savedLocale;
  if (/^zh-(HK|TW|MO)/i.test(browserLocale) && locales.includes('zh-HK')) return 'zh-HK';
  if (/^zh/i.test(browserLocale) && locales.includes('zh-CN')) return 'zh-CN';
  return locales.includes('en') ? 'en' : locales[0];
}
