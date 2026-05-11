import { Hono } from 'hono';
import { getSupabase } from './supabase.js';
import { verifyToken } from './auth-middleware.js';
import { requireAdmin } from './role-middleware.js';

const app = new Hono();

const ALLOWED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Text extraction for CF Workers:
// - TXT: decoded directly from buffer
// - DOCX: attempted via mammoth (pure-JS, nodejs_compat)
// - PDF: returns '' (pdf-parse requires fs which is unavailable in CF Workers)
async function extractText(buffer, fileType) {
  if (fileType === 'txt') {
    return buffer.toString('utf-8');
  }
  if (fileType === 'docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch {
      return '';
    }
  }
  // PDF: not extractable in CF Workers without a compatible library
  return '';
}

// GET /api/documents
app.get('/', verifyToken, async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('documents')
      .select('id, filename, original_name, file_type, label, document_type, file_size_bytes, storage_path, uploaded_by, created_at, users!uploaded_by(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json({ documents: data });
  } catch (err) {
    console.error('Get documents error:', err);
    return c.json({ error: 'Failed to fetch documents' }, 500);
  }
});

// POST /api/documents/upload
app.post('/upload', verifyToken, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    const label = body['label'];
    const document_type = body['document_type'];

    if (!label || !document_type) {
      return c.json({ error: 'Label and document type are required' }, 400);
    }

    const validDocTypes = [
      'INTERVIEW_PREP_NOTES',
      'SCENARIO_QUESTIONS',
      'STUDY_NOTES',
      'CLIENT_INTERVIEW_QUESTIONS',
      'CLIENT_EXPECTATIONS',
    ];

    if (!validDocTypes.includes(document_type)) {
      return c.json({ error: 'Invalid document type' }, 400);
    }

    const fileType = ALLOWED_TYPES[file.type];
    if (!fileType) {
      return c.json({ error: 'Invalid file type. Only PDF, DOCX, and TXT files are allowed.' }, 400);
    }

    if (file.size > MAX_SIZE) {
      return c.json({ error: 'File size exceeds 10MB limit.' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { randomUUID } = await import('node:crypto');
    const uniqueFilename = `${randomUUID()}.${fileType}`;
    const storagePath = `documents/${uniqueFilename}`;

    const supabase = getSupabase(c.env);
    const bucket = c.env.SUPABASE_STORAGE_BUCKET || 'interviewiq-docs';

    const { error: storageError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError) {
      console.error('Storage error:', storageError);
      return c.json({ error: 'Failed to upload file to storage' }, 500);
    }

    let extractedText = '';
    try {
      extractedText = await extractText(buffer, fileType);
    } catch (extractErr) {
      console.error('Text extraction error:', extractErr);
      extractedText = '';
    }

    const user = c.get('user');
    const { data, error } = await supabase
      .from('documents')
      .insert({
        filename: uniqueFilename,
        original_name: file.name,
        file_type: fileType,
        label,
        document_type,
        extracted_text: extractedText,
        storage_path: storagePath,
        file_size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return c.json({ document: data }, 201);
  } catch (err) {
    console.error('Upload error:', err);
    return c.json({ error: err.message || 'Failed to upload document' }, 500);
  }
});

// GET /api/documents/:id/download
app.get('/:id/download', verifyToken, async (c) => {
  try {
    const id = c.req.param('id');
    const supabase = getSupabase(c.env);

    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('id, storage_path, original_name')
      .eq('id', id)
      .single();

    if (fetchErr || !doc) return c.json({ error: 'Document not found' }, 404);

    const bucket = c.env.SUPABASE_STORAGE_BUCKET || 'interviewiq-docs';
    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(doc.storage_path, 60);

    if (signErr) throw signErr;

    return c.json({ url: signed.signedUrl, filename: doc.original_name });
  } catch (err) {
    console.error('Download error:', err);
    return c.json({ error: 'Failed to generate download link' }, 500);
  }
});

// DELETE /api/documents/:id — admin only
app.delete('/:id', verifyToken, requireAdmin, async (c) => {
  try {
    const id = c.req.param('id');
    const supabase = getSupabase(c.env);

    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return c.json({ error: 'Document not found' }, 404);
    }

    const bucket = c.env.SUPABASE_STORAGE_BUCKET || 'interviewiq-docs';
    await supabase.storage.from(bucket).remove([doc.storage_path]);

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return c.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete document error:', err);
    return c.json({ error: 'Failed to delete document' }, 500);
  }
});

export default app;
