const fs = require('fs');
const { parseMinimapFrame } = require('../app/minimapFrame');

/**
 * Reads a minimap frame from a command line value: a path to a JSON file or the JSON itself.
 * Exits through `fail` with a readable message when it is not a valid frame.
 */
function readMinimapFrame(value, fail) {
  if (typeof value !== 'string')
    fail('--minimap-frame needs a JSON file or JSON text.');
  let text = value;
  if (fs.existsSync(value)) text = fs.readFileSync(value, 'utf8');
  try {
    return parseMinimapFrame(JSON.parse(text));
  } catch (error) {
    return fail(`Invalid --minimap-frame: ${error.message}`);
  }
}

module.exports = { readMinimapFrame };
