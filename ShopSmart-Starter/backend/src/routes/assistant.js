import { Router } from 'express';
import { getAssistantAnswer } from '../services/assistant.js';
import { assistantQuestionSchema } from '../validators/schemas.js';

const router = Router();

router.post('/questions', async (request, response, next) => {
  try {
    const parsed = assistantQuestionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(422).json({
        error: { code: 'INVALID_QUESTION', message: 'Enter a question between 3 and 300 characters.' }
      });
    }

    response.json(await getAssistantAnswer(parsed.data.question));
  } catch (error) {
    // AssistantUnavailableError carries status 503 and a safe message; anything else becomes a generic 500.
    next(error);
  }
});

export default router;
