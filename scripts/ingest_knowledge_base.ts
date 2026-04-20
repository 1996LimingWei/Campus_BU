import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 直接使用项目中已有的 Supabase 配置
const SUPABASE_URL = 'https://fcbsekidlijtidqzkddx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYnNla2lkbGlqdGlkcXprZGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzgzMDAsImV4cCI6MjA4ODI1NDMwMH0.nOSFfSYw0_xAF9zt4S1qpppsCX3cD7BzRJoJI33Kxoo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const KB_DIR = path.resolve(__dirname, '../data/knowledge_base');

// 按 ## 和 ### 标题分块，每块附带来源文件和标题层级信息
function chunkMarkdown(markdown: string, source: string): { content: string; metadata: Record<string, string> }[] {
    const lines = markdown.split('\n');
    const chunks: { content: string; metadata: Record<string, string> }[] = [];

    let docTitle = '';
    let currentH2 = '';
    let currentH3 = '';
    let currentChunk = '';

    const flush = () => {
        const text = currentChunk.trim();
        if (text.length > 30) {
            const prefix = [currentH2, currentH3].filter(Boolean).map(h => `[${h}]`).join(' ');
            chunks.push({
                content: prefix ? `${prefix}\n${text}` : text,
                metadata: { source, title: docTitle, h2: currentH2, h3: currentH3 },
            });
        }
        currentChunk = '';
    };

    for (const line of lines) {
        if (line.startsWith('# ') && !docTitle) {
            flush();
            docTitle = line.replace('# ', '').trim();
        } else if (line.startsWith('## ')) {
            flush();
            currentH2 = line.replace('## ', '').trim();
            currentH3 = '';
        } else if (line.startsWith('### ')) {
            flush();
            currentH3 = line.replace('### ', '').trim();
        } else {
            currentChunk += line + '\n';
        }
    }
    flush();

    return chunks;
}

async function main() {
    // 读取所有 .md 文件
    const files = fs.readdirSync(KB_DIR).filter(f => f.endsWith('.md'));
    console.log(`找到 ${files.length} 个知识库文件: ${files.join(', ')}`);

    // 加载 embedding 模型
    console.log('加载 Embedding 模型 (Xenova/all-MiniLM-L6-v2) ...');
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    // 先清除旧数据（避免重复）
    console.log('清除旧的知识库数据...');
    const { error: deleteError } = await supabase
        .from('agent_knowledge_base')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows
    if (deleteError) {
        console.warn('清除旧数据时出错（可能是空表）:', deleteError.message);
    }

    let totalChunks = 0;
    let totalInserted = 0;

    for (const file of files) {
        const filePath = path.join(KB_DIR, file);
        const markdown = fs.readFileSync(filePath, 'utf-8');
        const chunks = chunkMarkdown(markdown, file);
        totalChunks += chunks.length;
        console.log(`\n处理 ${file} -> ${chunks.length} 个分块`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            // 生成 embedding
            const output = await extractor(chunk.content, { pooling: 'mean', normalize: true });
            const embeddingArray = Array.from(output.data) as number[];

            const { error } = await supabase.from('agent_knowledge_base').insert({
                content: chunk.content,
                metadata: chunk.metadata,
                embedding: embeddingArray,
            });

            if (error) {
                console.error(`  [${i + 1}/${chunks.length}] 写入失败: ${error.message}`);
            } else {
                totalInserted++;
                if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
                    console.log(`  [${i + 1}/${chunks.length}] 已写入`);
                }
            }
        }
    }

    console.log(`\n完成! 共 ${totalChunks} 个分块, 成功写入 ${totalInserted} 条`);
}

main().catch(console.error);
