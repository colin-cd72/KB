const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;

let client = null;

function getClient() {
  if (!process.env.CLAUDE_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  return client;
}

const EMPTY = {
  available: true,
  manufacturer: null, model: null, name: null, serial_number: null,
  serial_number_unverified: null,
  label_text: null, confidence: 'none', reasoning: null,
};

/**
 * The tool schema is the output contract. Forcing a call to it guarantees the
 * response shape without regex-scraping text. SDK 0.24.3 predates
 * output_config, so this is the available mechanism.
 */
function buildToolSchema() {
  return {
    name: 'record_identification',
    description: 'Record what you can determine about this piece of equipment from the photo.',
    input_schema: {
      type: 'object',
      properties: {
        manufacturer: { type: 'string', description: 'Manufacturer or brand, e.g. Blackmagic Design, Ross Video, AJA.' },
        model: { type: 'string', description: 'Model number exactly as printed, or as identified from the chassis.' },
        name: { type: 'string', description: 'Short human-readable product name.' },
        serial_number: { type: 'string', description: 'Serial number, ONLY if legible in the photo. Never guess.' },
        label_text: { type: 'string', description: 'Verbatim transcription of any label or spec-plate text.' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low', 'none'],
          description: 'high = read directly from a legible label; medium = confident visual identification; low = uncertain; none = cannot tell.' },
        reasoning: { type: 'string', description: 'One sentence on what the determination is based on.' },
      },
      required: ['confidence'],
    },
  };
}

const PROMPT = `You are identifying broadcast and AV equipment for an asset registry at TMRW Sports.

Do two things with this photo and use each to check the other:
1. TRANSCRIBE any visible label, sticker, or spec plate — model number, serial number, manufacturer.
2. IDENTIFY the product from the physical appearance of the chassis, front panel, and connectors.

Common vendors in this facility: Blackmagic Design, Ross Video, AJA, FS.com, Adder, Evertz.

Rules:
- Report a serial_number ONLY if you can actually read it in the image. Never infer or guess one. A wrong serial is worse than none.
- If the transcribed label and the visual identification disagree, lower your confidence and say so in reasoning.
- Use confidence "high" only when reading a legible label, not for visual recognition alone.

Call record_identification with what you determined.`;

function str(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Pull the forced tool_use block out of a message. */
function parseToolResponse(message) {
  const block = (message?.content || []).find(
    (b) => b.type === 'tool_use' && b.name === 'record_identification'
  );
  if (!block) return { ...EMPTY };
  const i = block.input || {};

  const confidence = ['high', 'medium', 'low', 'none'].includes(i.confidence) ? i.confidence : 'none';
  const serial = str(i.serial_number);
  const labelText = str(i.label_text);

  // A serial is only trusted when it actually appears in the transcribed label
  // text and the model is reasonably confident. Prompt wording is not a
  // safety mechanism: the model has been observed assigning "high" confidence
  // while reading page furniture rather than a spec plate. A wrong serial is
  // worse than a blank one - it looks like a fact and resurfaces inside an RMA.
  //
  // Corroboration must respect token boundaries. A raw substring search over a
  // space-stripped label lets '123' match inside 'MODEL 9123X', and merges
  // separate tokens so '2SN' matches across "REV 2 SN 123". Splitting into
  // alphanumeric tokens and joining *any* run of consecutive tokens closes the
  // substring hole but reopens the merge hole one level up: "REV 2 SN 123" is
  // three space-separated tokens, and a run over all three still concatenates
  // to "REV2SN" - a plausible-looking but bogus serial the model never
  // actually read as one field. The fix is to only merge tokens across
  // separators that don't contain whitespace (e.g. "ABC-123" or "S/N:ABC" are
  // one written field); a whitespace gap is a hard boundary between distinct
  // words and a run must not cross it. That keeps "S/N: ABC-123" corroborating
  // serial "ABC-123" (tokens ABC + 123, joined only by a hyphen) while
  // rejecting "REV2SN" assembled from three separate space-separated words.
  const MIN_SERIAL_LEN = 4;
  const MAX_RUN = 6;
  const normTok = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const labelStr = labelText || '';
  const tokenRe = /[A-Za-z0-9]+/g;
  const labelTokens = [];
  let m;
  while ((m = tokenRe.exec(labelStr)) !== null) {
    labelTokens.push({ text: m[0].toUpperCase(), start: m.index, end: m.index + m[0].length });
  }

  const candidates = new Set();
  for (let i = 0; i < labelTokens.length; i++) {
    let run = labelTokens[i].text;
    candidates.add(run);
    for (let j = i + 1; j < Math.min(i + MAX_RUN, labelTokens.length); j++) {
      const between = labelStr.slice(labelTokens[j - 1].end, labelTokens[j].start);
      if (/\s/.test(between)) break; // whitespace = a distinct word; stop extending this run
      run += labelTokens[j].text;
      candidates.add(run);
    }
  }

  const ns = normTok(serial);
  const corroborated = ns.length >= MIN_SERIAL_LEN && candidates.has(ns);
  const trusted = corroborated && (confidence === 'high' || confidence === 'medium');

  return {
    available: true,
    manufacturer: str(i.manufacturer),
    model: str(i.model),
    name: str(i.name),
    serial_number: trusted ? serial : null,
    // Surfaced so the UI can show it as a hint the technician must type in
    // themselves. Never pre-filled, never saved without confirmation.
    serial_number_unverified: !trusted ? serial : null,
    label_text: labelText,
    confidence,
    reasoning: str(i.reasoning),
  };
}

/**
 * @param {Buffer} buffer raw image bytes
 * @param {string} mediaType e.g. 'image/jpeg'
 */
async function identifyFromPhoto(buffer, mediaType) {
  const anthropic = getClient();
  if (!anthropic) {
    return { ...EMPTY, available: false, error: 'Claude API key not configured' };
  }
  try {
    const tool = buildToolSchema();
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
    return parseToolResponse(message);
  } catch (error) {
    console.error('Vision identification error:', error);
    return { ...EMPTY, available: false, error: error.message };
  }
}

module.exports = { identifyFromPhoto, buildToolSchema, parseToolResponse };
