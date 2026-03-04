import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Convert import.meta.url to __dirname equivalent for CommonJS/ESM mixed envs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Simplified markdown chunker
function chunkMarkdown(markdown: string): { content: string, metadata: any }[] {
    const lines = markdown.split('\n');
    const chunks: { content: string, metadata: any }[] = [];

    let currentH2 = '';
    let currentH3 = '';
    let currentChunk = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('## ')) {
            // Save previous chunk
            if (currentChunk.trim().length > 50) {
                chunks.push({
                    content: `[${currentH2}] ${currentH3 ? `[${currentH3}] ` : ''}\n${currentChunk.trim()}`,
                    metadata: { h2: currentH2, h3: currentH3 }
                });
            }
            currentH2 = line.replace('## ', '').trim();
            currentH3 = ''; // reset H3
            currentChunk = '';
        } else if (line.startsWith('### ')) {
            // Save previous chunk
            if (currentChunk.trim().length > 50) {
                chunks.push({
                    content: `[${currentH2}] ${currentH3 ? `[${currentH3}] ` : ''}\n${currentChunk.trim()}`,
                    metadata: { h2: currentH2, h3: currentH3 }
                });
            }
            currentH3 = line.replace('### ', '').trim();
            currentChunk = '';
        } else {
            currentChunk += line + '\n';
        }
    }

    // Save remainder
    if (currentChunk.trim().length > 50) {
        chunks.push({
            content: `[${currentH2}] ${currentH3 ? `[${currentH3}] ` : ''}\n${currentChunk.trim()}`,
            metadata: { h2: currentH2, h3: currentH3 }
        });
    }

    return chunks;
}

async function main() {
    console.log('1. Loading Embedding Model (Xenova/all-MiniLM-L6-v2) ...');
    // Using xenova/transformers pipeline
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    console.log('2. Reading Markdown File...');
    const faqPath = path.resolve(__dirname, '../data/knowledge_base/hkbu_faq_01.md');
    const markdown = fs.readFileSync(faqPath, 'utf-8');

    console.log('3. Chunking Document...');
    const chunks = chunkMarkdown(markdown);
    console.log(`Created ${chunks.length} chunks.`);

    console.log('4. Generating Embeddings and Uploading to Supabase...');
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

        // Generate embedding (tensor)
        const output = await extractor(chunk.content, { pooling: 'mean', normalize: true });

        // Convert tensor to regular array for pgvector
        const embeddingArray = Array.from(output.data);

        // Upload to database
        const { error } = await supabase.from('agent_knowledge_base').insert({
            content: chunk.content,
            metadata: chunk.metadata,
            embedding: embeddingArray
        });

        if (error) {
            console.error(`Error inserting chunk ${i + 1}:`, error.message);
        }
    }

    console.log('✅ Knowledge Base Ingestion Complete!');
}

main().catch(console.error);
