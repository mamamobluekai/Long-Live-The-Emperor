const express = require("express")


require('dotenv').config();

const app = require("./app")
const pool = require('./db');

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('Database connected:', result.rows[0].current_time);
  } catch (err) {
    console.error('Database connection failed:', err.message);
  }
});
