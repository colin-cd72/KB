const test = require('node:test');
const assert = require('node:assert/strict');
const { buildToolSchema, parseToolResponse } = require('../src/services/visionService');

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
});
