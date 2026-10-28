// ESLint flat config (eslint 9) para los scripts de frontend del Portal Cerro Azul.
const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  fetch: 'readonly', AbortController: 'readonly', URLSearchParams: 'readonly', URL: 'readonly',
  sessionStorage: 'readonly', localStorage: 'readonly', crypto: 'readonly',
  console: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  location: 'readonly', history: 'readonly', CustomEvent: 'readonly', Event: 'readonly',
  atob: 'readonly', btoa: 'readonly', Blob: 'readonly', FileReader: 'readonly', MutationObserver: 'readonly',
};

// Funciones definidas en cartera-procesador.js y usadas en cartera-admin.js
// (se cargan por <script> separado, por eso son globales en el navegador).
const carteraProcGlobals = {
  parsearCartera: 'readonly',
  leerPdf: 'readonly',
  agruparFacturas: 'readonly',
  cruzar: 'readonly',
  subirFacturas: 'readonly',
};

module.exports = [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...browserGlobals,
        ...carteraProcGlobals,
        module: 'readonly',
        CA: 'readonly',
        CA_CONFIG: 'readonly',
        XLSX: 'readonly',
        pdfjsLib: 'readonly',
        PDFLib: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'warn',
      eqeqeq: 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        module: 'readonly', require: 'readonly', process: 'readonly',
        describe: 'readonly', it: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly',
        ...browserGlobals,
        CA: 'readonly', CA_CONFIG: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      eqeqeq: 'error',
    },
  },
];
