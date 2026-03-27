export async function generatePlan(prompt: string, userId: string = 'test-user') {
  const response = await fetch('/api/orchestrator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, user_id: userId }),
  });
  return response;
}

export async function executePlan(sessionId: string, manifest: any, userId: string = 'test-user') {
  const response = await fetch('/api/orchestrator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'approve',
      session_id: sessionId,
      user_id: userId,
      manifest,
    }),
  });
  return response;
}

export async function pollExecutionResults(sessionId: string) {
  const response = await fetch(`/api/orchestrator?sessionId=${sessionId}`);
  return response;
}
