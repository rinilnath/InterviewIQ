const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractText(buffer, fileType) {
  const type = fileType.toLowerCase();

  if (type === 'pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (type === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (type === 'txt') {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

module.exports = { extractText };
