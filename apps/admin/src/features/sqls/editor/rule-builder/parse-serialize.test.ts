import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseRule,
  serializeRule,
  splitRuleParts,
  ruleToBadges,
} from './parse-serialize'

describe('splitRuleParts', () => {
  it('splits on pipe', () => {
    assert.deepEqual(splitRuleParts('required|integer|min:1'), [
      'required',
      'integer',
      'min:1',
    ])
  })

  it('keeps regex body with pipes intact', () => {
    assert.deepEqual(splitRuleParts('required|regex:/a|b/'), [
      'required',
      'regex:/a|b/',
    ])
  })
})

describe('parseRule / serializeRule', () => {
  it('parses required|string default', () => {
    const draft = parseRule('required|string')
    assert.equal(draft.required, true)
    assert.equal(draft.type, 'string')
    assert.equal(draft.needsAdvanced, false)
    assert.equal(serializeRule(draft), 'required|string')
  })

  it('round-trips integer with min/max', () => {
    const original = 'required|integer|min:1|max:100'
    const draft = parseRule(original)
    assert.equal(draft.type, 'integer')
    assert.equal(draft.rangeMode, 'min_max')
    assert.equal(draft.min, '1')
    assert.equal(draft.max, '100')
    assert.equal(serializeRule(draft), original)
  })

  it('round-trips between and enum', () => {
    const original = 'numeric|between:1,10|in:a,b,c'
    const draft = parseRule(original)
    assert.equal(draft.rangeMode, 'between')
    assert.equal(draft.betweenMin, '1')
    assert.equal(draft.betweenMax, '10')
    assert.equal(draft.enumMode, 'in')
    assert.deepEqual(draft.enumValues, ['a', 'b', 'c'])
    assert.equal(serializeRule(draft), original)
  })

  it('round-trips size, not_in, format, email', () => {
    const original = 'required|email|alpha_dash|size:8|not_in:admin,root'
    const draft = parseRule(original)
    assert.equal(draft.type, 'email')
    assert.deepEqual(draft.formatFlags, ['alpha_dash'])
    assert.equal(draft.rangeMode, 'size')
    assert.equal(draft.size, '8')
    assert.equal(draft.enumMode, 'not_in')
    assert.deepEqual(draft.enumValues, ['admin', 'root'])
    assert.equal(serializeRule(draft), original)
  })

  it('parses regex and preserves unknown parts', () => {
    const original = 'required|string|regex:/^[a-z]+$/|required_if:other,1'
    const draft = parseRule(original)
    assert.equal(draft.regexEnabled, true)
    assert.equal(draft.regex, '/^[a-z]+$/')
    assert.deepEqual(draft.unknownParts, ['required_if:other,1'])
    assert.equal(draft.needsAdvanced, true)
    assert.equal(serializeRule(draft), original)
  })

  it('serializes empty draft to empty string', () => {
    assert.equal(serializeRule(parseRule('')), '')
  })
})

describe('ruleToBadges', () => {
  it('returns parts for summary', () => {
    assert.deepEqual(ruleToBadges('required|integer'), [
      'required',
      'integer',
    ])
  })
})
