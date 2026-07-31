import {
  createEmptyDraft,
  type FormatFlag,
  type RuleDraft,
  type RuleType,
} from './types'

const TYPE_SET = new Set<RuleType>([
  'string',
  'integer',
  'numeric',
  'boolean',
  'array',
  'email',
  'url',
  'date',
])

const FORMAT_SET = new Set<FormatFlag>(['alpha', 'alpha_num', 'alpha_dash'])

/**
 * Split a validatorjs rule string on `|`, respecting `/.../` regex segments
 * that may themselves contain `|`.
 */
export function splitRuleParts(rule: string): string[] {
  const parts: string[] = []
  let current = ''
  let inRegex = false

  for (let i = 0; i < rule.length; i++) {
    const ch = rule[i]
    if (ch === '/' && (i === 0 || rule[i - 1] !== '\\')) {
      // Enter/exit regex only when this looks like regex:/.../
      if (!inRegex && current.endsWith('regex:')) {
        inRegex = true
        current += ch
        continue
      }
      if (inRegex) {
        inRegex = false
        current += ch
        continue
      }
    }
    if (ch === '|' && !inRegex) {
      const trimmed = current.trim()
      if (trimmed) parts.push(trimmed)
      current = ''
      continue
    }
    current += ch
  }
  const trimmed = current.trim()
  if (trimmed) parts.push(trimmed)
  return parts
}

export function parseRule(rule: string): RuleDraft {
  const draft = createEmptyDraft()
  const parts = splitRuleParts(rule || '')

  let hasMin = false
  let hasMax = false
  let hasBetween = false
  let hasSize = false

  for (const part of parts) {
    if (part === 'required') {
      draft.required = true
      continue
    }

    if (TYPE_SET.has(part as RuleType)) {
      draft.type = part as RuleType
      continue
    }

    if (FORMAT_SET.has(part as FormatFlag)) {
      if (!draft.formatFlags.includes(part as FormatFlag)) {
        draft.formatFlags.push(part as FormatFlag)
      }
      continue
    }

    const minMatch = /^min:(-?\d+(?:\.\d+)?)$/.exec(part)
    if (minMatch) {
      draft.min = minMatch[1]
      hasMin = true
      continue
    }

    const maxMatch = /^max:(-?\d+(?:\.\d+)?)$/.exec(part)
    if (maxMatch) {
      draft.max = maxMatch[1]
      hasMax = true
      continue
    }

    const betweenMatch = /^between:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(
      part
    )
    if (betweenMatch) {
      draft.betweenMin = betweenMatch[1]
      draft.betweenMax = betweenMatch[2]
      hasBetween = true
      continue
    }

    const sizeMatch = /^size:(-?\d+(?:\.\d+)?)$/.exec(part)
    if (sizeMatch) {
      draft.size = sizeMatch[1]
      hasSize = true
      continue
    }

    const inMatch = /^in:(.+)$/.exec(part)
    if (inMatch) {
      draft.enumMode = 'in'
      draft.enumValues = inMatch[1]
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      continue
    }

    const notInMatch = /^not_in:(.+)$/.exec(part)
    if (notInMatch) {
      draft.enumMode = 'not_in'
      draft.enumValues = notInMatch[1]
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      continue
    }

    const regexMatch = /^regex:(.+)$/.exec(part)
    if (regexMatch) {
      draft.regexEnabled = true
      draft.regex = regexMatch[1]
      continue
    }

    draft.unknownParts.push(part)
  }

  if (hasBetween) {
    draft.rangeMode = 'between'
  } else if (hasSize) {
    draft.rangeMode = 'size'
  } else if (hasMin || hasMax) {
    draft.rangeMode = 'min_max'
  }

  draft.needsAdvanced = draft.unknownParts.length > 0
  return draft
}

export function serializeRule(draft: RuleDraft): string {
  const parts: string[] = []

  if (draft.required) parts.push('required')
  if (draft.type) parts.push(draft.type)

  for (const flag of draft.formatFlags) {
    parts.push(flag)
  }

  if (draft.rangeMode === 'min_max') {
    if (draft.min.trim() !== '') parts.push(`min:${draft.min.trim()}`)
    if (draft.max.trim() !== '') parts.push(`max:${draft.max.trim()}`)
  } else if (draft.rangeMode === 'between') {
    const a = draft.betweenMin.trim()
    const b = draft.betweenMax.trim()
    if (a !== '' && b !== '') parts.push(`between:${a},${b}`)
  } else if (draft.rangeMode === 'size') {
    if (draft.size.trim() !== '') parts.push(`size:${draft.size.trim()}`)
  }

  if (draft.enumMode === 'in' && draft.enumValues.length > 0) {
    parts.push(`in:${draft.enumValues.join(',')}`)
  } else if (draft.enumMode === 'not_in' && draft.enumValues.length > 0) {
    parts.push(`not_in:${draft.enumValues.join(',')}`)
  }

  if (draft.regexEnabled && draft.regex.trim() !== '') {
    let pattern = draft.regex.trim()
    if (!pattern.startsWith('/')) {
      pattern = `/${pattern}/`
    }
    parts.push(`regex:${pattern}`)
  }

  for (const unknown of draft.unknownParts) {
    parts.push(unknown)
  }

  return parts.join('|')
}

/** Split a rule string into badge labels for summary display. */
export function ruleToBadges(rule: string): string[] {
  return splitRuleParts(rule || '')
}
