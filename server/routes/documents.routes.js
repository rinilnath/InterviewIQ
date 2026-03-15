const express = require('express');
const crypto = require('crypto');
const supabase = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');
const { upload, ALLOWED_TYPES } = require('../middleware/upload.middleware');
const { extractText } = require('../services/document.service');

const router = express.Router();

router.use(verifyToken, requireAdmin);

// GET /api/documents
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, filename, original_name, file_type, label, document_type, file_size_bytes, storage_path, uploaded_by, created_at, users(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ documents: data });
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { label, document_type } = req.body;

    if (!label || !document_type) {
      return res.status(400).json({ error: 'Label and document type are required' });
    }

    const validDocTypes = [
      'INTERVIEW_PREP_NOTES',
      'SCENARIO_QUESTIONS',
      'STUDY_NOTES',
      'CLIENT_INTERVIEW_QUESTIONS',
      'CLIENT_EXPECTATIONS',
    ];

    if (!validDocTypes.includes(document_type)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    const fileType = ALLOWED_TYPES[req.file.mimetype];
    const uniqueFilename = `${crypto.randomUUID()}.${fileType}`;
    const storagePath = `documents/${uniqueFilename}`;

    // Upload to Supabase Storage
    const { error: storageError } = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || 'interviewiq-docs')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (storageError) {
      console.error('Storage error:', storageError);
      return res.status(500).json({ error: 'Failed to upload file to storage' });
    }

    // Extract text
    let extractedText = '';
    try {
      extractedText = await extractText(req.file.buffer, fileType);
    } catch (extractErr) {
      console.error('Text extraction error:', extractErr);
      extractedText = '';
    }

    // Save to database
    const { data, error } = await supabase
      .from('documents')
      .insert({
        filename: uniqueFilename,
        original_name: req.file.originalname,
        file_type: fileType,
        label,
        document_type,
        extracted_text: extractedText,
        storage_path: storagePath,
        file_size_bytes: req.file.size,
        uploaded_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ document: data });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload document' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get document first
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete from storage
    await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || 'interviewiq-docs')
      .remove([doc.storage_path]);

    // Delete from database
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
