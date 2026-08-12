import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Leer un const antes de declararlo es válido para el compilador y
      // revienta en tiempo de ejecución: la página se queda en blanco sin más
      // pista. Pasó dos veces en /new-transfer al reordenar hooks, y ni el
      // build ni una revisión a ojo lo detectan.
      // Aviso y no error porque la regla no distingue las dos situaciones: una
      // función usada dentro de un useEffect y declarada más abajo es
      // perfectamente válida (el efecto corre después del render) y este
      // proyecto lo hace en varios sitios. Lo que hay que mirar de cada aviso
      // es si la lectura ocurre en el cuerpo del componente — ahí sí revienta.
      'no-use-before-define': ['warn', { functions: false, variables: true, classes: true }],
    },
  },
])
