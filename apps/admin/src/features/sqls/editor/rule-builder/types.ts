export type RuleType =
  | 'string'
  | 'integer'
  | 'numeric'
  | 'boolean'
  | 'array'
  | 'email'
  | 'url'
  | 'date'
  | ''

export type EnumMode = 'none' | 'in' | 'not_in'

export type RangeMode = 'none' | 'min_max' | 'between' | 'size'

export type FormatFlag = 'alpha' | 'alpha_num' | 'alpha_dash'

export type RuleDraft = {
  required: boolean
  type: RuleType
  rangeMode: RangeMode
  min: string
  max: string
  betweenMin: string
  betweenMax: string
  size: string
  enumMode: EnumMode
  enumValues: string[]
  formatFlags: FormatFlag[]
  regexEnabled: boolean
  regex: string
  unknownParts: string[]
  needsAdvanced: boolean
}

export function createEmptyDraft(): RuleDraft {
  return {
    required: false,
    type: '',
    rangeMode: 'none',
    min: '',
    max: '',
    betweenMin: '',
    betweenMax: '',
    size: '',
    enumMode: 'none',
    enumValues: [],
    formatFlags: [],
    regexEnabled: false,
    regex: '',
    unknownParts: [],
    needsAdvanced: false,
  }
}
