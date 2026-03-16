import * as ff from '@google-cloud/functions-framework';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Worker Template for Phase 0
 *
 * Ephemeral Cloud Function that:
 * 1. Boots
 * 2. Loads a JIT skill (mocked via local file reading)
 * 3. Fetches a KMS-decrypted credential (mocked)
 * 4. Executes a task
 * 5. Writes result to Sovereign Motherboard (mocked via local JSON file)
 * 6. Terminates
 */

// Mock Sovereign Motherboard (Supabase) Database
const MOCK_SUPABASE_FILE = path.join(process.cwd(), 'mock-supabase-results.json');

// Mock KMS Decryption Service
async function mockKmsDecrypt(credentialId: string): Promise<string> {
    console.log(`[Worker] Fetching KMS-decrypted credential for: ${credentialId}`);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));
    return `decrypted-secret-for-${credentialId}-12345`;
}

// Mock JIT Skill Loader
async function mockLoadSkill(skillName: string): Promise<string> {
    console.log(`[Worker] Loading JIT skill: ${skillName}`);
    const skillPath = path.join(process.cwd(), 'skills', `${skillName}.md`);

    try {
        if (fs.existsSync(skillPath)) {
            return fs.readFileSync(skillPath, 'utf8');
        }
        return `Mock skill content for ${skillName} (File not found)`;
    } catch (err) {
        console.error(`[Worker] Failed to load skill ${skillName}:`, err);
        throw new Error(`Skill ${skillName} could not be loaded`);
    }
}

// Write to Mock Sovereign Motherboard
async function mockWriteToMotherboard(session_id: string, task: string, result: any) {
    console.log(`[Worker] Writing results to Sovereign Motherboard for session: ${session_id}`);

    let db: any[] = [];
    if (fs.existsSync(MOCK_SUPABASE_FILE)) {
        try {
            db = JSON.parse(fs.readFileSync(MOCK_SUPABASE_FILE, 'utf8'));
        } catch (e) {
            db = [];
        }
    }

    db.push({
        id: `result_${Date.now()}`,
        session_id,
        task,
        status: 'success',
        output: result,
        created_at: new Date().toISOString()
    });

    fs.writeFileSync(MOCK_SUPABASE_FILE, JSON.stringify(db, null, 2));
}

// Export the handler for testing/execution
export const workerHandler = async (req: ff.Request, res: ff.Response) => {
    // Basic CORS handling
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
        return;
    }

    const { session_id, task, skills = [], credentials = [] } = req.body;

    if (!session_id || !task) {
        res.status(400).json({ error: 'Missing session_id or task in request body.' });
        return;
    }

    console.log(`[Worker] Booting for session: ${session_id}`);
    console.log(`[Worker] Task to execute: ${task}`);

    try {
        // 1. Load JIT Skills
        const loadedSkills: Record<string, string> = {};
        for (const skill of skills) {
            loadedSkills[skill] = await mockLoadSkill(skill);
        }

        // 2. Fetch KMS-decrypted credentials
        const decryptedCredentials: Record<string, string> = {};
        for (const cred of credentials) {
            decryptedCredentials[cred] = await mockKmsDecrypt(cred);
        }

        // 3. Execute Task (Mock execution)
        console.log(`[Worker] Executing task...`);

        // Let's pretend our execution does something simple like parsing the skill
        // and using the credential to return a dummy response.
        const executionResult = {
            message: `Executed task: "${task}" successfully`,
            skillsUsed: skills,
            credentialsAccessed: credentials,
            timestamp: new Date().toISOString()
        };

        // 4. Write result to Sovereign Motherboard (Mock Supabase)
        await mockWriteToMotherboard(session_id, task, executionResult);

        // 5. Terminate and return response
        console.log(`[Worker] Task completed. Terminating.`);

        res.status(200).json({
            status: 'success',
            result: executionResult
        });

    } catch (error: any) {
        console.error('[Worker] Execution failed:', error);
        res.status(500).json({ error: 'Internal server error during worker execution', details: error.message });
    }
};

// Register HTTP function
ff.http('workerTemplate', workerHandler);
