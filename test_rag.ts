import * as dotenv from 'dotenv';
import * as path from 'path';
import { AgentExecutor } from './services/agent/executor';

// Load env for local test
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function testFAQ() {
    console.log('--- Testing HKBU Knowledge Base Search ---');
    const executor = new AgentExecutor('test_user_id');

    const queries = [
        "图书馆几点开门？",
        "GPA 怎么算？",
        "校巴怎么坐？"
    ];

    for (const q of queries) {
        console.log(`\nUser: ${q}`);
        // Mock onUpdate to see logic
        const response = await executor.process(q, (token) => {
            // silent for test
        });

        console.log(`AI: ${response.finalAnswer}`);
        console.log(`Tools used: ${response.steps.map(s => s.action?.tool).filter(Boolean).join(', ')}`);
    }
}

testFAQ().catch(console.error);
