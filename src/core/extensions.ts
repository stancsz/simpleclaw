export type ExtensionType = "skill" | "knowledgebase" | "mcp" | "webhook";

export interface Extension {
  name: string;
  type: ExtensionType;
  route?: string; // Only for webhook type
  start?: () => Promise<void>;
  execute: (args: any) => Promise<any> | any;
}

class Registry {
  private extensions: Map<string, Extension> = new Map();

  register(extension: Extension) {
    if (this.extensions.has(extension.name)) {
      console.warn(
        `Extension ${extension.name} is already registered. Overwriting.`,
      );
    }
    this.extensions.set(extension.name, extension);
  }

  get(name: string): Extension | undefined {
    return this.extensions.get(name);
  }

  getAll(): Extension[] {
    return Array.from(this.extensions.values());
  }

  findWebhook(path: string): Extension | undefined {
    return Array.from(this.extensions.values()).find(
      (ext) => ext.type === "webhook" && ext.route === path,
    );
  }

  has(name: string): boolean {
    return this.extensions.has(name);
  }

  async execute(name: string, args: any): Promise<any> {
    const ext = this.get(name);
    if (!ext) {
      throw new Error(`Extension ${name} not found`);
    }
    return await ext.execute(args);
  }
}

export const extensionRegistry = new Registry();
