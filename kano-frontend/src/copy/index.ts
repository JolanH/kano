/**
 * Copy deck entry point.
 *
 * Today only English is shipped. The default export is the active locale's
 * key/value map; swapping it for a runtime-selected locale (post-MVP i18n
 * work) keeps the `useCopy` consumer surface unchanged.
 */

import en from './en'

export { en }
export type { CopyKey } from './en'
export default en
