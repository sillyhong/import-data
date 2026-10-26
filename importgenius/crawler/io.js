const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

async function writeJsonAtomically(filePath, value, options = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(value), 'utf8');
    if (options.exclusive) {
      // Publish a complete list snapshot without ever replacing an existing page.
      await fs.link(tempPath, filePath);
      await fs.rm(tempPath, { force: true });
    } else {
      await fs.rename(tempPath, filePath);
    }
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function readJsonArray(filePath) {
  const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`预期 JSON 数组：${filePath}`);
  return value;
}

module.exports = { writeJsonAtomically, readJsonArray };
