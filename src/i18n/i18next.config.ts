export type Locale = 'en-US' | 'es-ES';
export const locales = ['en', 'es'];

export default {
  lexers: {
    mjs: ['JavascriptLexer'],
    js: ['JavascriptLexer'],
    ts: ['JavascriptLexer'],
    jsx: ['JsxLexer'],
    tsx: ['JsxLexer']
  },
  locales,
  output: 'src/i18n/$LOCALE.keys.json',
  input: '../**/*.{ts,tsx}'
};
