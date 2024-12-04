import { assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert";
import chatAgent from "./main.js";

// Test context setup
function createMockContext() {
    return {
        __tags__: { turnId: 'test-turn-id' },
        __requestId__: 'test-request-id',
        __executionId__: 'test-execution-id',
        modules: {
            ai: {
                chat: {
                    openai: async ({ instructions, messages }, streamFn) => ({
                        prompt: messages,
                        tokens: 100,
                        answer: 'Mock AI response'
                    })
                }
            },
            agents: {
                transcriber: async ({ audio }) => ({
                    message: 'Transcribed text'
                })
            }
        },
        resources: {
            copilotz: {
                name: 'Test Copilot',
                backstory: 'Test backstory',
                job: {
                    role: 'Test role',
                    goal: 'Test goal',
                    description: 'Test description'
                }
            },
            config: {
                AI_CHAT_PROVIDER: {
                    provider: 'openai'
                }
            }
        },
        utils: {
            createPrompt: (template, variables) => template,
            getThreadHistory: () => Promise.resolve(null),
            jsonSchemaToShortSchema: schema => schema
        },
        env: {
            OPENAI_CREDENTIALS_apiKey: 'test-api-key'
        }
    };
}

Deno.test({
    name: "chatAgent - Text Input Processing",
    async fn() {
        const mockContext = createMockContext();
        const mockRes = { stream: () => {} };

        const params = {
            instructions: 'Test instructions',
            input: 'Hello, AI!',
            thread: { extId: 'test-thread-id' },
            user: { id: 'test-user' }
        };

        const boundChatAgent = chatAgent.bind(mockContext);
        const response = await boundChatAgent(params, mockRes);

        assertObjectMatch(response, {
            message: 'Mock AI response',
            consumption: {
                type: 'tokens',
                value: 100
            }
        });
        assertExists(response.prompt);
    }
});

Deno.test({
    name: "chatAgent - Audio Input Processing",
    async fn() {
        const mockContext = createMockContext();
        const mockRes = { stream: () => {} };

        const params = {
            instructions: 'Test instructions',
            audio: 'base64-audio-data',
            thread: { extId: 'test-thread-id' },
            user: { id: 'test-user' }
        };

        const boundChatAgent = chatAgent.bind(mockContext);
        const response = await boundChatAgent(params, mockRes);

        assertObjectMatch(response, {
            message: 'Mock AI response',
            consumption: {
                type: 'tokens',
                value: 100
            }
        });
    }
});

Deno.test({
    name: "chatAgent - Thread History Handling",
    async fn() {
        const mockContext = createMockContext();
        // Override getThreadHistory with mock history
        mockContext.utils.getThreadHistory = () => Promise.resolve({
            prompt: [
                { role: 'user', content: 'Previous message' },
                { role: 'assistant', content: 'Previous response' }
            ],
            message: 'Previous response'
        });

        const mockRes = { stream: () => {} };
        const params = {
            instructions: 'Test instructions',
            input: 'New message',
            thread: { extId: 'test-thread-id' },
            user: { id: 'test-user' }
        };

        const boundChatAgent = chatAgent.bind(mockContext);
        const response = await boundChatAgent(params, mockRes);

        assertExists(response);
        assertExists(response.message);
    }
});

Deno.test({
    name: "chatAgent - Custom AI Provider Configuration",
    async fn() {
        const mockContext = createMockContext();
        // Setup custom provider
        mockContext.resources.config.AI_CHAT_PROVIDER = {
            provider: 'custom_provider',
            customOption: 'value'
        };

        mockContext.modules.ai.chat.custom_provider = async ({ instructions, messages }, streamFn) => ({
            prompt: messages,
            tokens: 150,
            answer: 'Custom provider response'
        });

        const mockRes = { stream: () => {} };
        const params = {
            instructions: 'Test instructions',
            input: 'Hello',
            thread: { extId: 'test-thread-id' }
        };

        const boundChatAgent = chatAgent.bind(mockContext);
        const response = await boundChatAgent(params, mockRes);

        assertEquals(response.message, 'Custom provider response');
        assertEquals(response.consumption.value, 150);
    }
});

Deno.test({
    name: "chatAgent - Error Handling",
    async fn() {
        const mockContext = createMockContext();
        mockContext.modules.ai.chat.openai = async () => {
            throw new Error('AI service error');
        };

        const mockRes = { stream: () => {} };
        const params = {
            instructions: 'Test instructions',
            input: 'Hello',
            thread: { extId: 'test-thread-id' }
        };

        const boundChatAgent = chatAgent.bind(mockContext);
        
        try {
            await boundChatAgent(params, mockRes);
            throw new Error('Should have thrown an error');
        } catch (error) {
            assertEquals(error.message, 'AI service error');
        }
    }
}); 