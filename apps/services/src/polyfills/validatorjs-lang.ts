/**
 * Bun `build --compile` cannot resolve validatorjs's dynamic
 * `require('./lang/' + lang)`, so language messages stay undefined and
 * `validation.fails()` crashes with `messages.def`.
 *
 * Register English messages eagerly (static import) before any Validator use.
 */
import Validator from 'validatorjs';
// Package ships messages as plain CJS; no dedicated type declarations.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const en = require('validatorjs/src/lang/en') as Record<string, unknown>;

Validator.setMessages('en', en);
Validator.useLang('en');
