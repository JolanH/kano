import { Linter } from 'eslint'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

const linter = new Linter()
const msgs = linter.verify('<template><div>Submit</div></template>', {
  files: ['*.vue'],
  languageOptions: { parser: vueParser },
  plugins: { vue: vuePlugin },
  rules: { 'vue/no-bare-strings-in-template': 'error' },
}, 'test.vue')
console.log(JSON.stringify(msgs, null, 2))
