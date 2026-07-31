import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getEnvAIConfig,
  parseOllamaJsonContent,
  resolveAIConfig,
  resolveOllamaApiKey
} from './ai';
import {
  closeDB,
  deleteSetting,
  encryptPassword,
  setSettingJSON
} from './sqlite';

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

describe('resolveOllamaApiKey', () => {
  before(() => {
    process.env.APP_SECRET = process.env.APP_SECRET || 'test-secret-for-ai-tests';
  });

  it('returns empty for missing / blank values', () => {
    assert.strictEqual(resolveOllamaApiKey(undefined), '');
    assert.strictEqual(resolveOllamaApiKey(null), '');
    assert.strictEqual(resolveOllamaApiKey(''), '');
    assert.strictEqual(resolveOllamaApiKey('   '), '');
  });

  it('returns plaintext when value is not encrypted', () => {
    assert.strictEqual(
      resolveOllamaApiKey('ollama-api-key-plain'),
      'ollama-api-key-plain'
    );
  });

  it('decrypts AES-GCM encrypted values', () => {
    const encrypted = encryptPassword('secret-token-xyz');
    assert.strictEqual(resolveOllamaApiKey(encrypted), 'secret-token-xyz');
  });
});

describe('resolveAIConfig api_key overlay', function () {
  this.timeout(10000);

  let tmpDir: string;
  let prevSqlite: string | undefined;
  let prevSecret: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql2api-ai-cfg-'));
    prevSqlite = process.env.SQLITE_PATH;
    prevSecret = process.env.APP_SECRET;
    process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
    process.env.APP_SECRET = 'test-secret-for-ai-config';
    closeDB();
  });

  after(() => {
    deleteSetting('ai');
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (prevSqlite === undefined) {
      delete process.env.SQLITE_PATH;
    } else {
      process.env.SQLITE_PATH = prevSqlite;
    }
    if (prevSecret === undefined) {
      delete process.env.APP_SECRET;
    } else {
      process.env.APP_SECRET = prevSecret;
    }
    closeDB();
  });

  afterEach(() => {
    deleteSetting('ai');
  });

  it('uses decrypted online api_key over env', () => {
    const encrypted = encryptPassword('online-key-abc');
    setSettingJSON('ai', {
      provider: 'ollama',
      ollama: {
        base_url: 'https://ollama.example.com',
        model: 'test-model',
        api_key: encrypted
      }
    });

    const resolved = resolveAIConfig();
    assert.strictEqual(resolved.source, 'online');
    assert.strictEqual(resolved.ollama.api_key, 'online-key-abc');
    assert.strictEqual(resolved.ollama.base_url, 'https://ollama.example.com');
  });

  it('falls back to env api_key when online has no key', () => {
    setSettingJSON('ai', {
      provider: 'ollama',
      ollama: {
        base_url: 'https://ollama.example.com',
        model: 'test-model'
      }
    });

    const env = getEnvAIConfig();
    const resolved = resolveAIConfig();
    assert.strictEqual(resolved.source, 'online');
    assert.strictEqual(resolved.ollama.api_key, env.ollama.api_key);
  });

  it('accepts legacy plaintext online api_key', () => {
    setSettingJSON('ai', {
      provider: 'ollama',
      ollama: {
        base_url: 'https://ollama.example.com',
        model: 'test-model',
        api_key: 'legacy-plain-key'
      }
    });

    const resolved = resolveAIConfig();
    assert.strictEqual(resolved.ollama.api_key, 'legacy-plain-key');
  });
});
