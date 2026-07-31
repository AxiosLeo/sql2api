import type { FormatFlag, RuleType } from './types'

export const RULE_TYPES: Array<{ value: RuleType; label: string }> = [
  { value: 'string', label: 'String' },
  { value: 'integer', label: 'Integer' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'date', label: 'Date' },
]

export const FORMAT_OPTIONS: Array<{ value: FormatFlag; label: string }> = [
  { value: 'alpha', label: 'Alpha (letters only)' },
  { value: 'alpha_num', label: 'Alpha-numeric' },
  { value: 'alpha_dash', label: 'Alpha-dash (letters, digits, _, -)' },
]

export const STRING_LIKE_TYPES: RuleType[] = [
  'string',
  'email',
  'url',
  'date',
  '',
]

export function isStringLikeType(type: RuleType): boolean {
  return STRING_LIKE_TYPES.includes(type)
}
