import express from 'express';
import { getAssistantAnswer } from '../services/assistant.js';

const router = express.Router();

router.post('/questions', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const result = await getAssistantAnswer(question);
    return res.json(result);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: `Server Error: ${error.message || 'Unknown error'}`
    });
  }
});

export default router;