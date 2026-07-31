import assert from 'assert';
import { parseOllamaJsonContent } from './ai';

describe('parseOllamaJsonContent', () => {
  it('parses plain JSON', () => {
    const result = parseOllamaJsonContent<{ passed: boolean }>('{"passed":true}');
    assert.strictEqual(result.passed, true);
  });

  it('parses fenced json block', () => {
    const raw = 'Here you go:\n```json\n{"name":"get-user"}\n```\n';
    const result = parseOllamaJsonContent<{ name: string }>(raw);
    assert.strictEqual(result.name, 'get-user');
  });

  it('extracts first object from surrounding text', () => {
    const raw = 'Sure. {"sql":"SELECT 1","sql_type":"select"} done.';
    const result = parseOllamaJsonContent<{ sql: string; sql_type: string }>(raw);
    assert.strictEqual(result.sql, 'SELECT 1');
    assert.strictEqual(result.sql_type, 'select');
  });

  it('throws on empty content', () => {
    assert.throws(() => parseOllamaJsonContent('   '), /Empty model response/);
  });

  it('throws on non-JSON content', () => {
    assert.throws(() => parseOllamaJsonContent('not json at all'), /not valid JSON/);
  });
});
