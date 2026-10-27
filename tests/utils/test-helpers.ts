/**
 * Test Helpers
 * 
 * Utilities for comprehensive testing of generated agents
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generateProject } from '../../dist/generator.js';
import type { WizardAnswers } from '../../dist/wizard.js';
import type { ChainKey, X402Provider } from '../../dist/config.js';
import { TEST_BASE_DIR } from './test-output.js';

export { TEST_BASE_DIR, cleanupTestOutput, removeTestProject } from './test-output.js';

const execAsync = promisify(exec);

// Test configuration
export const TEST_HOST = process.env.TEST_HOST || '127.0.0.1';
export const getTestBaseUrl = (port: number) => `http://${TEST_HOST}:${port}`;

// Port allocation based on hash of project name to avoid conflicts.
// Blocks start at 20000 so a worker cannot bind a well-known port such as 6000.
const usedPorts = new Set<number>();
const PORT_BLOCK_BASE = 20000;
const WORKER_PORT_BLOCK_SIZE = 2000;
const WORKER_PORT_OFFSET = (() => {
    const raw =
        process.env.VITEST_WORKER_ID ||
        process.env.JEST_WORKER_ID ||
        process.env.VITEST_POOL_ID ||
        "0";
    const workerId = Number(raw);
    return Number.isFinite(workerId) ? workerId * WORKER_PORT_BLOCK_SIZE : 0;
})();

// Get a unique port based on project name (deterministic)
export function getPort(projectName: string): number {
    let hash = 0;
    for (let i = 0; i < projectName.length; i++) {
        hash = ((hash << 5) - hash) + projectName.charCodeAt(i);
        hash = hash & hash;
    }
    const blockBase = PORT_BLOCK_BASE + WORKER_PORT_OFFSET;
    let port = blockBase + Math.abs(hash % WORKER_PORT_BLOCK_SIZE);
    
    // Find next available port if collision
    while (usedPorts.has(port)) {
        port++;
        if (port >= blockBase + WORKER_PORT_BLOCK_SIZE) {
            port = blockBase;
        }
    }
    
    usedPorts.add(port);
    return port;
}

// Legacy function for compatibility
export function getNextPort(): number {
    const blockBase = PORT_BLOCK_BASE + WORKER_PORT_OFFSET;
    let port = blockBase + usedPorts.size;
    while (usedPorts.has(port)) {
        port++;
        if (port >= blockBase + WORKER_PORT_BLOCK_SIZE) {
            port = blockBase;
        }
    }
    usedPorts.add(port);
    return port;
}

// Reset ports (not typically needed with hash-based approach)
export function resetPorts(): void {
    usedPorts.clear();
}

/**
 * Agent generation options
 */
export interface TestAgentOptions {
    chain: ChainKey;
    features: ('a2a' | 'mcp' | 'x402')[];
    a2aStreaming?: boolean;
    projectName?: string;
    x402Provider?: X402Provider;
}

/**
 * Generate a test agent with specified options
 */
export async function generateTestAgent(options: TestAgentOptions): Promise<string> {
    const projectName = options.projectName || `test-${options.chain}-${Date.now()}`;
    const projectDir = path.join(TEST_BASE_DIR, projectName);
    
    // Ensure test output directory exists
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
    
    // Clean up if exists
    await fs.rm(projectDir, { recursive: true, force: true });
    
    const answers: WizardAnswers = {
        projectDir: projectDir,
        agentName: `Test Agent ${options.chain}`,
        agentDescription: `Comprehensive test agent for ${options.chain}`,
        agentImage: 'https://example.com/test-agent.png',
        features: options.features,
        a2aStreaming: options.a2aStreaming ?? false,
        chain: options.chain,
        trustModels: ['reputation'],
        agentWallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        x402Provider: options.x402Provider,
    };
    
    await generateProject(answers);
    return projectDir;
}

/**
 * Install dependencies in generated project
 */
export async function installDependencies(projectDir: string): Promise<void> {
    await execAsync('npm install', { cwd: projectDir });
}

/**
 * Add mock mode to agent.ts for testing without OpenAI
 */
export async function enableMockMode(projectDir: string): Promise<void> {
    const agentPath = path.join(projectDir, 'src', 'agent.ts');
    let content = await fs.readFile(agentPath, 'utf-8');
    
    // Add mock mode at the start of the chat function
    const mockCode = `
  // MOCK MODE for testing - always return mock response
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  return \`[MOCK] Received: "\${lastUserMsg}". This is a test response.\`;
`;
    
    // Insert mock code after the function declaration
    content = content.replace(
        /export async function chat\(messages: AgentMessage\[\]\): Promise<string> \{/,
        `export async function chat(messages: AgentMessage[]): Promise<string> {${mockCode}`
    );
    
    // Also handle streaming version if present (streamResponse function)
    const streamMockCode = `
  // MOCK MODE for testing - yield mock response
  yield \`[MOCK] Received streaming request. This is a test response.\`;
  return;
`;
    
    content = content.replace(
        /export async function\* streamResponse\(userMessage: string, history: AgentMessage\[\] = \[\]\): AsyncGenerator<string> \{/,
        `export async function* streamResponse(userMessage: string, history: AgentMessage[] = []): AsyncGenerator<string> {${streamMockCode}`
    );
    
    await fs.writeFile(agentPath, content);
}

/**
 * Create a minimal .env file for testing
 */
export async function createTestEnv(projectDir: string, port: number): Promise<void> {
    const envContent = `
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
PINATA_JWT=test_jwt_not_used_in_tests
OPENAI_API_KEY=test_key_not_used_in_mock_mode
PORT=${port}
`;
    await fs.writeFile(path.join(projectDir, '.env'), envContent);
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
    try {
        process.kill(-pid, signal);
    } catch {
        try {
            process.kill(pid, signal);
        } catch {
            // The process already exited.
        }
    }
}

/**
 * Server process manager
 */
export class ServerProcess {
    private process: ChildProcess | null = null;
    private output: string = '';
    
    constructor(
        private projectDir: string,
        private script: string,
        private port: number
    ) {}
    
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.process = spawn('npx', ['tsx', `src/${this.script}`], {
                cwd: this.projectDir,
                env: { ...process.env, PORT: String(this.port) },
                stdio: ['pipe', 'pipe', 'pipe'],
                // Own process group so stop() can kill npx and the server it spawns.
                detached: true,
            });
            
            this.process.stdout?.on('data', (data) => {
                this.output += data.toString();
            });
            
            this.process.stderr?.on('data', (data) => {
                this.output += data.toString();
            });
            
            this.process.on('error', reject);
            
            this.process.on('exit', (code) => {
                if (code !== null && code !== 0) {
                    reject(new Error(`Server exited with code ${code}. Output: ${this.output}`));
                }
            });
            
            // Poll for server readiness. The listen banner can arrive in the
            // same moment the last attempt gives up, so keep probing after it.
            const checkServer = async () => {
                const started = Date.now();
                let deadline = started + 45_000;
                let extendedForBanner = false;
                let lastHttp = "";
                while (Date.now() < deadline) {
                    await new Promise(r => setTimeout(r, 250));

                    if (this.process?.exitCode !== null) {
                        reject(new Error(`Server died. Output: ${this.output}`));
                        return;
                    }

                    if (!extendedForBanner && this.output.includes("A2A Server running")) {
                        extendedForBanner = true;
                        deadline = Math.max(deadline, Date.now() + 10_000);
                    }

                    try {
                        const res = await fetch(`${getTestBaseUrl(this.port)}/.well-known/agent-card.json`);
                        if (res.ok) {
                            resolve();
                            return;
                        }
                        const body = await res.text();
                        lastHttp = `HTTP ${res.status} ${body.slice(0, 200)}`;
                    } catch {
                        // Server not ready yet
                    }
                }
                reject(new Error(
                    `Server failed to respond within ${Math.round((Date.now() - started) / 1000)}s. ${lastHttp} Output: ${this.output}`
                ));
            };
            
            checkServer();
        });
    }
    
    async stop(): Promise<void> {
        const child = this.process;
        const pid = child?.pid;
        if (!child || !pid) {
            this.process = null;
            return;
        }
        signalProcessGroup(pid, "SIGTERM");
        await new Promise(resolve => setTimeout(resolve, 500));
        if (child.exitCode === null) {
            signalProcessGroup(pid, "SIGKILL");
        }
        this.process = null;
    }
    
    getOutput(): string {
        return this.output;
    }
}

/**
 * A2A HTTP client for testing
 */
export class A2ATestClient {
    constructor(private baseUrl: string) {}
    
    async getAgentCard(): Promise<any> {
        const response = await fetch(`${this.baseUrl}/.well-known/agent-card.json`);
        return response.json();
    }
    
    async sendMessage(message: string, contextId?: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/a2a`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'message/send',
                params: {
                    message: {
                        role: 'user',
                        parts: [{ type: 'text', text: message }],
                    },
                    configuration: contextId ? { contextId } : undefined,
                },
                id: Date.now(),
            }),
        });
        return response.json();
    }
    
    async getTask(taskId: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/a2a`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tasks/get',
                params: { taskId },
                id: Date.now(),
            }),
        });
        return response.json();
    }
    
    async cancelTask(taskId: string): Promise<any> {
        const response = await fetch(`${this.baseUrl}/a2a`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tasks/cancel',
                params: { taskId },
                id: Date.now(),
            }),
        });
        return response.json();
    }
}

/**
 * MCP test client
 */
export async function testMCPServer(projectDir: string): Promise<{
    tools: any[];
    echoResult: any;
    timeResult: any;
    chatResult: any;
}> {
    const transport = new StdioClientTransport({
        command: 'npx',
        args: ['tsx', 'src/mcp-server.ts'],
        cwd: projectDir,
        env: { ...process.env },
    });
    
    const client = new Client(
        { name: 'test-client', version: '1.0.0' },
        { capabilities: {} }
    );
    
    try {
        await client.connect(transport);
        
        // List tools
        const toolsResult = await client.listTools();
        
        // Call echo tool
        const echoResult = await client.callTool({
            name: 'echo',
            arguments: { message: 'Test message' },
        });
        
        // Call get_time tool
        const timeResult = await client.callTool({
            name: 'get_time',
            arguments: {},
        });
        
        // Call chat tool (will use mock)
        const chatResult = await client.callTool({
            name: 'chat',
            arguments: { message: 'Hello' },
        });
        
        return {
            tools: toolsResult.tools,
            echoResult,
            timeResult,
            chatResult,
        };
    } finally {
        await client.close();
    }
}

/**
 * Validate registration file structure against ERC-8004 spec
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateRegistrationFile(regFile: any): ValidationResult {
    const errors: string[] = [];
    
    // Required fields per ERC-8004 best practices
    if (!regFile.name || typeof regFile.name !== 'string') {
        errors.push('Missing or invalid "name" field');
    }
    
    if (!regFile.description || typeof regFile.description !== 'string') {
        errors.push('Missing or invalid "description" field');
    }
    
    // Optional but recommended
    if (regFile.image && typeof regFile.image !== 'string') {
        errors.push('Invalid "image" field - must be string');
    }
    
    // services array (was endpoints)
    if (regFile.services) {
        if (!Array.isArray(regFile.services)) {
            errors.push('"services" must be an array');
        } else {
            regFile.services.forEach((service: any, i: number) => {
                if (!service.name) {
                    errors.push(`Service ${i} missing "name"`);
                }
                if (!service.endpoint && service.name !== 'OASF') {
                    errors.push(`Service ${i} missing "endpoint"`);
                }
            });
        }
    }
    
    // supportedTrust array
    if (regFile.supportedTrust) {
        if (!Array.isArray(regFile.supportedTrust)) {
            errors.push('"supportedTrust" must be an array');
        } else {
            const validTrusts = ['reputation', 'crypto-economic', 'tee-attestation'];
            regFile.supportedTrust.forEach((trust: string) => {
                if (!validTrusts.includes(trust)) {
                    errors.push(`Invalid trust model: ${trust}`);
                }
            });
        }
    }
    
    // active boolean
    if (regFile.active !== undefined && typeof regFile.active !== 'boolean') {
        errors.push('"active" must be boolean');
    }
    
    // x402Support boolean
    if (regFile.x402Support !== undefined && typeof regFile.x402Support !== 'boolean') {
        errors.push('"x402Support" must be boolean');
    }
    
    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Read generated file content
 */
export async function readGeneratedFile(projectDir: string, filePath: string): Promise<string> {
    return fs.readFile(path.join(projectDir, filePath), 'utf-8');
}

/**
 * Check if file exists
 */
export async function fileExists(projectDir: string, filePath: string): Promise<boolean> {
    try {
        await fs.access(path.join(projectDir, filePath));
        return true;
    } catch {
        return false;
    }
}
