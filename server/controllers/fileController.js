const express = require('express');
const multer = require('multer');
const path = require('path');
const cloudinary = require('../db/cloudinary');
const pool = require('../db');
const streamifier = require('streamifier');

function uploadToCloudinary(buffer, resourceType, originalName) {
  return new Promise((resolve, reject) => {
    const options = {
      resource_type: resourceType,
      folder: 'student_uploads',
    };

    if (resourceType === 'raw') {
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext);
      const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, '_');
      options.public_id = `${safeBase}${ext}`;
      options.use_filename = true;
      options.unique_filename = true;
    }

    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => err ? reject(err) : resolve(result)
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

const uploadFile = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const userId = req.user.id;
    const studentResult = await pool.query('SELECT id FROM students WHERE user_id = $1', [userId]);
    if (!studentResult.rows.length) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    const studentId = studentResult.rows[0].id;

    const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw';
    const result = await uploadToCloudinary(file.buffer, resourceType, file.originalname);

    const downloadUrl = result.secure_url.replace('/upload/', '/upload/fl_attachment/');

    const dbResult = await pool.query(
      `INSERT INTO files (student_id, original_name, cloudinary_public_id, cloudinary_url, resource_type, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [studentId, file.originalname, result.public_id, downloadUrl, resourceType, file.size, file.mimetype]
    );

    res.status(201).json(dbResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
};

const getMyFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const studentResult = await pool.query('SELECT id FROM students WHERE user_id = $1', [userId]);
    if (!studentResult.rows.length) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    const studentId = studentResult.rows[0].id;
    const result = await pool.query(
      'SELECT * FROM files WHERE student_id = $1 ORDER BY created_at DESC',
      [studentId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('getMyFiles error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getAllFiles = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, s.student_number, u.email as student_email,
              (s.first_name || ' ' || s.last_name) as student_name
       FROM files f
       JOIN students s ON s.id = f.student_id
       JOIN users u ON u.id = s.user_id
       ORDER BY f.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('getAllFiles error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const getFileById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'File not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('getFileById error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

const deleteFile = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM files WHERE id = $1 AND student_id = (SELECT id FROM students WHERE user_id = $2) RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'File not found or not authorized.' });
    res.json({ message: 'File deleted successfully.', file: result.rows[0] });
  } catch (err) {
    console.error('deleteFile error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = {
  uploadFile,
  getMyFiles,
  getAllFiles,
  getFileById,
  deleteFile,
};