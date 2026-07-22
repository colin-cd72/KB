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
  return {
    available: true,
    manufacturer: str(i.manufacturer),
    model: str(i.model),
    name: str(i.name),
    serial_number: str(i.serial_number),
    label_text: str(i.label_text),
    confidence: ['high', 'medium', 'low', 'none'].includes(i.confidence) ? i.confidence : 'none',
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
