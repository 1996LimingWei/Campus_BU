import * as dotenv from 'dotenv';
import * as path from 'path';

// Mock react-native and async-storage before any other imports
import Module from 'module';
const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (md: string) {
    if (md === 'react-native') {
        return { Platform: { OS: 'ios' }, StyleSheet: { create: (s: any) => s }, NativeModules: {} };
    }
    if (md === '@react-native-async-storage/async-storage') {
        return { default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() } };
    }
    return originalRequire.apply(this, arguments);
};

// Now import the actual services after mocking
import { FAQService } from './services/faq';

// Load env for local test
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function testFAQ() {
    console.log('--- Testing HKBU Knowledge Base Search ---');

    const queries = [
        "图书馆几点开门？",
        "GPA 怎么算？",
        "怎么连 Wi-Fi？"
    ];

    for (const q of queries) {
        console.log(`\nQuery: ${q}`);
        const results = await FAQService.searchKnowledgeBase(q);
        console.log(`Found ${results.length} chunks.`);
        results.forEach((r: any, i: number) => {
            console.log(`[Chunk ${i + 1}] ${r.content.substring(0, 100).replace(/\n/g, ' ')}...`);
        });
    }
}

testFAQ().catch(console.error);
