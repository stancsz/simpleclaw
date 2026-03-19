export interface Task {
    id: string;
    description: string;
    worker: string;
    skills: string[];
    credentials: string[];
    depends_on: string[];
    action_type: 'READ' | 'WRITE';
    parameters?: Record<string, any>;
}

export interface SwarmManifest {
    version: string;
    intent_parsed: string;
    skills_required: string[];
    credentials_required: string[];
    schedule?: string | null;
    steps: Task[];
}

export interface WorkerConfig {
    worker_id: string;
    skills: string[];
    credentials: string[];
}

export interface PlanDiffApprove {
    plan: SwarmManifest;
    write_operations: number;
    read_operations: number;
    status: 'waiting_approval' | 'approved' | 'rejected';
    sessionId: string;
}

export interface SkillReference {
    id: string;
    name: string;
    version?: string;
}

export interface CredentialReference {
    id: string;
    name: string;
    type: string;
}

export type AIKeyProvider = 'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'github' | 'custom';

export interface AIKey {
    id: string;
    name: string;
    provider: AIKeyProvider | string;
    maskedKey: string;
    createdAt: string;
}
