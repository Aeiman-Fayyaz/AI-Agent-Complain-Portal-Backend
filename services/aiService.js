const { GoogleGenAI } = require('@google/genai');

/**
 * Heuristic Local NLP Fallback Classifier
 */
function inferSentiment(text = '') {
  const lower = text.toLowerCase();

  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('critical') || lower.includes('immediately')) {
    return 'Urgent';
  }

  if (lower.includes('angry') || lower.includes('furious') || lower.includes('hate') || lower.includes('terrible') || lower.includes('awful')) {
    return 'Angry';
  }

  if (lower.includes('frustrated') || lower.includes('annoyed') || lower.includes('cannot') || lower.includes('not working') || lower.includes('still')) {
    return 'Frustrated';
  }

  if (lower.includes('thanks') || lower.includes('great') || lower.includes('love') || lower.includes('happy')) {
    return 'Positive';
  }

  if (lower.includes('please') || lower.includes('need help') || lower.includes('problem') || lower.includes('issue')) {
    return 'Negative';
  }

  return 'Neutral';
}

const DUPLICATE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'when', 'where', 'why', 'how', 'my', 'me', 'i', 'we', 'you', 'your', 'our', 'us',
  'it', 'its', 'is', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'for', 'from', 'with', 'without', 'into', 'onto',
  'about', 'after', 'before', 'again', 'very', 'more', 'most', 'some', 'any', 'all', 'have', 'has', 'had', 'do', 'does', 'did', 'not', 'can',
  'could', 'would', 'should', 'need', 'help', 'issue', 'problem', 'please', 'already', 'just', 'still', 'now', 'today', 'yesterday', 'am', 'pm', 'at'
]);

const DUPLICATE_SYNONYMS = {
  charge: ['charge', 'charged', 'billing', 'payment', 'paid', 'deducted', 'refund', 'refunded', 'invoice'],
  order: ['order', 'purchase', 'transaction', 'invoice', 'checkout'],
  deliver: ['delivery', 'deliver', 'shipped', 'shipment', 'package', 'arrived', 'arrive', 'late', 'missing'],
  login: ['login', 'log in', 'signin', 'sign in', 'access', 'password', 'account', 'authentication'],
  error: ['error', 'bug', 'failed', 'fail', 'broken', 'crash', 'down', 'not working']
};

function normalizeDuplicateText(text = '') {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const normalized = token.trim();
      if (!normalized || DUPLICATE_STOP_WORDS.has(normalized)) return null;
      return normalized;
    })
    .filter(Boolean);
}

function expandDuplicateTokens(tokens = []) {
  const expanded = new Set();

  tokens.forEach((token) => {
    expanded.add(token);
    Object.entries(DUPLICATE_SYNONYMS).forEach(([canonical, variants]) => {
      if (variants.includes(token) || token.includes(canonical)) {
        expanded.add(canonical);
        variants.forEach((variant) => expanded.add(variant));
      }
    });
  });

  return [...expanded];
}

function scoreDuplicateSimilarity(currentText = '', candidateText = '') {
  const currentTokens = expandDuplicateTokens(normalizeDuplicateText(currentText));
  const candidateTokens = expandDuplicateTokens(normalizeDuplicateText(candidateText));
  const currentSet = new Set(currentTokens);
  const candidateSet = new Set(candidateTokens);

  const intersection = [...currentSet].filter((token) => candidateSet.has(token));
  const union = new Set([...currentSet, ...candidateSet]);
  const overlapRatio = union.size ? intersection.length / union.size : 0;

  const currentImportant = currentTokens.filter((token) => !DUPLICATE_STOP_WORDS.has(token)).length;
  const candidateImportant = candidateTokens.filter((token) => !DUPLICATE_STOP_WORDS.has(token)).length;
  const sharedImportant = intersection.filter((token) => !DUPLICATE_STOP_WORDS.has(token)).length;
  const tokenConfidence = currentImportant && candidateImportant ? sharedImportant / Math.max(currentImportant, candidateImportant) : 0;

  const sharedPhrase = [currentText.toLowerCase(), candidateText.toLowerCase()].every((text) => text.includes('order') && text.includes('charged'))
    || [currentText.toLowerCase(), candidateText.toLowerCase()].every((text) => text.includes('payment') && text.includes('deduct'))
    || [currentText.toLowerCase(), candidateText.toLowerCase()].every((text) => text.includes('delivery') && text.includes('late'));

  const score = Math.min(0.99, overlapRatio * 0.6 + tokenConfidence * 0.3 + (sharedPhrase ? 0.2 : 0));
  return Number(score.toFixed(3));
}

async function detectDuplicateComplaint(subject = '', description = '', historicalText = '') {
  const currentText = `${subject} ${description}`.trim();
  const historical = historicalText || '';

  if (!currentText || !historical) {
    return { isDuplicate: false, score: 0, reason: 'No historical complaint to compare.' };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

  if (apiKey) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Compare these two complaint descriptions for semantic similarity. Decide whether they are likely the same issue or a potential duplicate. Use context, not just shared keywords.

Current complaint: "${currentText}"
Existing complaint: "${historical}"

Return only valid JSON with this exact structure:
{"isDuplicate": true|false, "score": 0.0-1.0, "reason": "brief explanation"}

Treat similar complaints as duplicates only when they clearly describe the same underlying problem or same root cause, even if wording differs.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const rawText = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed.isDuplicate === 'boolean') {
        const score = Number(parsed.score) || 0;
        if (parsed.isDuplicate && score >= 0.58) {
          return { isDuplicate: true, score, reason: parsed.reason || 'Semantically similar complaint detected.' };
        }
        if (!parsed.isDuplicate) {
          return { isDuplicate: false, score: Math.max(score, 0), reason: parsed.reason || 'No meaningful similar complaint detected.' };
        }
      }
    } catch (error) {
      console.warn('[AI Service Warning] Duplicate detection AI check failed; using local fallback.', error.message);
    }
  }

  const fallbackScore = scoreDuplicateSimilarity(currentText, historical);
  const isDuplicate = fallbackScore >= 0.58 && (currentText.length > 18 && historical.length > 18);

  return {
    isDuplicate,
    score: fallbackScore,
    reason: isDuplicate
      ? 'This complaint appears to describe the same underlying issue as a previous complaint.'
      : 'No sufficiently similar complaint was found.'
  };
}

function fallbackTriage(subject = '', description = '') {
  const text = `${subject} ${description}`.toLowerCase();

  let category = 'General';
  let priority = 'Medium';
  let summary = '';

  // Billing check
  if (
    text.includes('charge') ||
    text.includes('charged') ||
    text.includes('bill') ||
    text.includes('payment') ||
    text.includes('refund') ||
    text.includes('invoice') ||
    text.includes('twice') ||
    text.includes('price')
  ) {
    category = 'Billing';
    if (text.includes('twice') || text.includes('refund') || text.includes('overcharge') || text.includes('unauthorized') || text.includes('deducted')) {
      priority = 'Critical';
      summary = 'Possible duplicate payment, unauthorized deduction, or urgent refund request by customer.';
    } else {
      priority = 'Medium';
      summary = 'Billing or payment inquiry submitted by customer.';
    }
  }
  // Technical check
  else if (
    text.includes('error') ||
    text.includes('bug') ||
    text.includes('crash') ||
    text.includes('down') ||
    text.includes('broken') ||
    text.includes('fail') ||
    text.includes('server') ||
    text.includes('500') ||
    text.includes('404')
  ) {
    category = 'Technical';
    if (text.includes('crash') || text.includes('down') || text.includes('critical') || text.includes('urgent') || text.includes('outage')) {
      priority = 'Critical';
      summary = 'Critical technical defect or outage reported by customer.';
    } else {
      priority = 'Medium';
      summary = 'Technical bug or system error reported by customer.';
    }
  }
  // Account check
  else if (
    text.includes('login') ||
    text.includes('password') ||
    text.includes('account') ||
    text.includes('access') ||
    text.includes('auth') ||
    text.includes('profile')
  ) {
    category = 'Account';
    if (text.includes('locked') || text.includes('hacked') || text.includes('cannot login') || text.includes('security breach')) {
      priority = 'High';
      summary = 'Account lockout or authentication difficulty.';
    } else {
      priority = 'Medium';
      summary = 'Account management or sign-in assistance requested.';
    }
  }
  // Feature Request check
  else if (
    text.includes('feature') ||
    text.includes('add') ||
    text.includes('request') ||
    text.includes('suggest') ||
    text.includes('enhancement')
  ) {
    category = 'Feature Request';
    priority = 'Low';
    summary = 'Feature enhancement request submitted by customer.';
  }
  // Default General
  else {
    category = 'General';
    priority = 'Low';
    summary = subject ? `General customer inquiry regarding: ${subject}` : 'General customer inquiry.';
  }

  const sentiment = inferSentiment(`${subject} ${description}`);

  return { category, priority, sentiment, summary };
}

/**
 * AI Ticket Triage Service
 * Uses Google Gemini API if key is available, falls back to heuristic engine if absent or error.
 */
async function triageTicket(subject, description) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

  if (!apiKey) {
    console.log('[AI Service] No Gemini API key provided. Using intelligent local NLP classifier.');
    return fallbackTriage(subject, description);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an expert customer support AI triage classifier. Analyze the following support ticket and classify it.

Ticket Subject: "${subject}"
Ticket Description: "${description}"

Respond ONLY with a valid raw JSON object (no markdown, no backticks) in the following format:
{
  "category": "Billing" | "Technical" | "Account" | "Feature Request" | "General",
  "priority": "Low" | "Medium" | "High" | "Critical",
  "sentiment": "Positive" | "Neutral" | "Frustrated" | "Angry" | "Negative" | "Urgent",
  "summary": "Concise 1-sentence summary of the ticket's core issue"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    let rawText = response.text || '';
    // Clean code block ticks if present
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(rawText);

    // Validate category
    const validCategories = ['Billing', 'Technical', 'Account', 'Feature Request', 'General'];
    const category = validCategories.includes(parsed.category) ? parsed.category : 'General';

    // Validate priority
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    const priority = validPriorities.includes(parsed.priority) ? parsed.priority : 'Medium';

    // Validate sentiment
    const validSentiments = ['Positive', 'Neutral', 'Frustrated', 'Angry', 'Negative', 'Urgent'];
    const sentiment = validSentiments.includes(parsed.sentiment) ? parsed.sentiment : inferSentiment(`${subject} ${description}`);

    // Validate summary
    const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : subject;

    console.log('[AI Service] Gemini AI triage success:', { category, priority, sentiment, summary });
    return { category, priority, sentiment, summary };
  } catch (error) {
    console.warn('[AI Service Warning] Gemini API call failed or returned invalid JSON. Using local fallback. Error:', error.message);
    return fallbackTriage(subject, description);
  }
}

module.exports = {
  triageTicket,
  detectDuplicateComplaint
};
