const { GoogleGenAI } = require('@google/genai');

/**
 * Heuristic Local NLP Fallback Classifier
 */
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
    if (text.includes('twice') || text.includes('refund') || text.includes('overcharge') || text.includes('unauthorized')) {
      priority = 'High';
      summary = 'Possible duplicate payment or urgent refund requested by customer.';
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
    if (text.includes('crash') || text.includes('down') || text.includes('critical') || text.includes('urgent')) {
      priority = 'High';
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
    if (text.includes('locked') || text.includes('hacked') || text.includes('cannot login')) {
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

  return { category, priority, summary };
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
  "priority": "Low" | "Medium" | "High",
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
    const validPriorities = ['Low', 'Medium', 'High'];
    const priority = validPriorities.includes(parsed.priority) ? parsed.priority : 'Medium';

    // Validate summary
    const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : subject;

    console.log('[AI Service] Gemini AI triage success:', { category, priority, summary });
    return { category, priority, summary };
  } catch (error) {
    console.warn('[AI Service Warning] Gemini API call failed or returned invalid JSON. Using local fallback. Error:', error.message);
    return fallbackTriage(subject, description);
  }
}

module.exports = {
  triageTicket
};
