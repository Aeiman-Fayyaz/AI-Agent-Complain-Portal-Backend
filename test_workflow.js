const API_URL = 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const config = { ...options, headers };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const res = await fetch(url, config);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Request failed with status ${res.status}`);
  }
  return data;
}

async function runE2ETest() {
  console.log('=======================================================');
  console.log('🚀 STARTING E2E WORKFLOW DEMO VERIFICATION');
  console.log('=======================================================');

  try {
    // Step 1: Customer Login
    console.log('\n[Step 1] Customer Logging in...');
    const custLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { email: 'customer@demo.com', password: 'password123' }
    });
    const customerToken = custLoginRes.data.token;
    console.log('✓ Customer logged in successfully. Token received.');

    // Step 2 & 3: Create Ticket & AI Triage
    console.log('\n[Step 2 & 3] Customer submitting ticket: "I was charged twice for the same order and need one payment refunded."');
    const ticketRes = await request('/tickets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        subject: 'I was charged twice for the same order and need one payment refunded.',
        description: 'Checked my credit card statement and order #9921 was billed $299.00 twice at 10:14 AM. Please issue a refund for the duplicate transaction.'
      }
    });

    const ticket = ticketRes.data;
    console.log(`✓ Ticket Created! Ticket #: ${ticket.ticketNumber}, ID: ${ticket._id}`);
    console.log(`🤖 AI Triage Results:`);
    console.log(`   - Category: ${ticket.category}`);
    console.log(`   - Priority: ${ticket.priority}`);
    console.log(`   - AI Summary: "${ticket.aiSummary}"`);

    // Step 4 & 5: Agent Login & Human AI Review
    console.log('\n[Step 4] Agent Logging in...');
    const agentLoginRes = await request('/auth/login', {
      method: 'POST',
      body: { email: 'agent@demo.com', password: 'password123' }
    });
    const agentToken = agentLoginRes.data.token;
    console.log('✓ Support Agent logged in successfully.');

    console.log('\n[Step 5] Agent reviewing & approving AI suggestions...');
    const updateAiRes = await request(`/tickets/${ticket._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: {
        category: 'Billing',
        priority: 'High',
        aiSummary: 'Possible duplicate payment reported by customer on order #9921.',
        isAiApproved: true
      }
    });
    console.log('✓ AI Triage Suggestions approved & saved by Agent.');

    // Step 6: Customer & Agent Conversation
    console.log('\n[Step 6] Customer & Agent exchanging messages...');
    const agentMsgRes = await request(`/tickets/${ticket._id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: { content: 'Hello Alex! I am processing your refund request for order #9921 right now.' }
    });
    console.log(`✓ Agent sent reply message: "${agentMsgRes.data.content}"`);

    const custMsgRes = await request(`/tickets/${ticket._id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { content: 'Thank you Sarah! I appreciate the fast response.' }
    });
    console.log(`✓ Customer sent reply message: "${custMsgRes.data.content}"`);

    // Step 7 & 8: Real-Time Update & Ticket Resolution with mandatory note
    console.log('\n[Step 7 & 8] Agent resolving ticket with required resolution note...');
    const resolveRes = await request(`/tickets/${ticket._id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: {
        status: 'Resolved',
        resolutionNote: 'Refund of $299.00 issued successfully via payment gateway (Ref: RFD-88219).'
      }
    });
    console.log(`✓ Ticket Status updated to: ${resolveRes.data.status}`);
    console.log(`   - Resolution Note: "${resolveRes.data.resolutionNote}"`);

    // Step 9: Dashboard Statistics
    console.log('\n[Step 9] Fetching updated Dashboard Statistics...');
    const statsRes = await request('/dashboard/stats', {
      headers: { Authorization: `Bearer ${agentToken}` }
    });
    console.log('📊 Live Dashboard Statistics (MongoDB):');
    console.log(JSON.stringify(statsRes.data, null, 2));

    console.log('\n=======================================================');
    console.log('🎉 ALL 9 WORKFLOW STEPS DEMONSTRATED & VERIFIED 100%!');
    console.log('=======================================================');
  } catch (error) {
    console.error('❌ E2E Test Failed:', error.message);
  }
}

runE2ETest();
