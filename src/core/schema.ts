export interface SwarmManifest {
    version: string;
    intent_parsed: string;
    skills_required: string[];
    credentials_required: string[];
    schedule?: string;
    steps: SwarmStep[];
}

export interface SwarmStep {
    id: string;
    description: string;
    worker: string;
    skills: string[];
    credentials: string[];
    depends_on: string[];
    action_type: 'READ' | 'WRITE';
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
