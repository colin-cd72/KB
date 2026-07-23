const test = require('node:test');
const assert = require('node:assert/strict');
const { buildToolSchema, parseToolResponse, identifyFromPhoto } = require('../src/services/visionService');

test('buildToolSchema', async (t) => {
  await t.test('declares every field the review form needs', () => {
    const tool = buildToolSchema();
    assert.equal(tool.name, 'record_identification');
    const props = tool.input_schema.properties;
    for (const f of ['manufacturer', 'model', 'name', 'serial_number', 'label_text', 'confidence', 'reasoning']) {
      assert.ok(props[f], `missing property ${f}`);
    }
    assert.deepEqual(props.confidence.enum, ['high', 'medium', 'low', 'none']);
    assert.deepEqual(tool.input_schema.required, ['confidence']);
  });
});

test('parseToolResponse', async (t) => {
  await t.test('extracts the tool_use block', () => {
    const msg = { content: [
      { type: 'text', text: 'Looking at the label...' },
      { type: 'tool_use', name: 'record_identification', input: {
        manufacturer: 'Blackmagic Design', model: 'ATEM 2 M/E', name: null,
        serial_number: 'ABC123', label_text: 'ATEM 2 M/E  S/N ABC123',
        confidence: 'high', reasoning: 'Serial read directly from the spec plate.' } },
    ] };
    const r = parseToolResponse(msg);
    assert.equal(r.available, true);
    assert.equal(r.manufacturer, 'Blackmagic Design');
    assert.equal(r.serial_number, 'ABC123');
    assert.equal(r.confidence, 'high');
  });

  await t.test('returns a none-confidence result when no tool block is present', () => {
    const r = parseToolResponse({ content: [{ type: 'text', text: 'I cannot tell.' }] });
    assert.equal(r.confidence, 'none');
    assert.equal(r.manufacturer, null);
    assert.equal(r.available, true);
  });

  await t.test('normalizes missing optional fields to null', () => {
    const msg = { content: [
      { type: 'tool_use', name: 'record_identification', input: { confidence: 'low' } },
    ] };
    const r = parseToolResponse(msg);
    assert.equal(r.model, null);
    assert.equal(r.serial_number, null);
    assert.equal(r.confidence, 'low');
  });

  await t.test('coerces empty strings to null so the form does not prefill blanks', () => {
    const msg = { content: [
      { type: 'tool_use', name: 'record_identification', input: { manufacturer: '   ', confidence: 'medium' } },
    ] };
    assert.equal(parseToolResponse(msg).manufacturer, null);
  });

  await t.test('trusts a serial that appears in the transcribed label text', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: 'ABC123', label_text: 'ATEM 2 M/E  S/N ABC123', confidence: 'high' } }] };
    const r = parseToolResponse(msg);
    assert.equal(r.serial_number, 'ABC123');
    assert.equal(r.serial_number_unverified, null);
  });

  await t.test('rejects a serial that is absent from the label text', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: 'GUESSED99', label_text: 'ATEM 2 M/E', confidence: 'high' } }] };
    const r = parseToolResponse(msg);
    assert.equal(r.serial_number, null, 'uncorroborated serial must not be trusted');
    assert.equal(r.serial_number_unverified, 'GUESSED99');
  });

  await t.test('rejects a serial when there is no label text at all', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: 'ABC123', confidence: 'high' } }] };
    assert.equal(parseToolResponse(msg).serial_number, null);
  });

  await t.test('rejects a corroborated serial at low confidence', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: 'ABC123', label_text: 'S/N ABC123', confidence: 'low' } }] };
    const r = parseToolResponse(msg);
    assert.equal(r.serial_number, null);
    assert.equal(r.serial_number_unverified, 'ABC123');
  });

  await t.test('matches a serial despite punctuation and case differences', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: 'abc-123', label_text: 'SERIAL: ABC123', confidence: 'medium' } }] };
    assert.equal(parseToolResponse(msg).serial_number, 'abc-123');
  });

  await t.test('rejects a short serial that is only a substring of a longer token', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: '123', label_text: 'MODEL 9123X', confidence: 'high' } }] };
    const r = parseToolResponse(msg);
    assert.equal(r.serial_number, null);
    assert.equal(r.serial_number_unverified, '123');
  });

  await t.test('rejects a serial assembled across unrelated label words', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: 'REV2SN', label_text: 'REV 2 SN 123', confidence: 'high' } }] };
    assert.equal(parseToolResponse(msg).serial_number, null);
  });

  await t.test('still corroborates a serial split by punctuation in the label', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: 'ABC-123', label_text: 'S/N: ABC-123', confidence: 'high' } }] };
    assert.equal(parseToolResponse(msg).serial_number, 'ABC-123');
  });

  await t.test('rejects a serial below the minimum length even if present', () => {
    const msg = { content: [{ type: 'tool_use', name: 'record_identification', input: {
      serial_number: 'AB1', label_text: 'S/N AB1', confidence: 'high' } }] };
    assert.equal(parseToolResponse(msg).serial_number, null);
  });
});

test('identifyFromPhoto without an API key', async (t) => {
  await t.test('returns a well-formed unavailable result instead of throwing', async () => {
    const saved = process.env.CLAUDE_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    try {
      const r = await identifyFromPhoto(Buffer.from('not-a-real-image'), 'image/jpeg');
      assert.equal(r.available, false);
      assert.equal(r.confidence, 'none');
      assert.equal(r.serial_number, null);
      assert.match(r.error, /not configured/i);
    } finally {
      if (saved !== undefined) process.env.CLAUDE_API_KEY = saved;
    }
  });
});
