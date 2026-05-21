import { Linter } from 'eslint'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

const linter = new Linter()
const messages = linter.verify('<template><div>Submit</div></template>', {
  files: ['*.vue'],
  languageOptions: { parser: vueParser },
  plugins: { vue: vuePlugin },
  rules: { 'vue/no-bare-strings-in-template': 'error' },
})
console.log(JSON.stringify(messages, null, 2))
