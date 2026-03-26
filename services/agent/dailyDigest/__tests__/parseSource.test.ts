import { parseDailyDigestItems, parseDailyDigestSummaryText } from '../parseSource';

describe('parseDailyDigestItems', () => {
    it('extracts section links and binds them to the matching summary line', () => {
        const html = `
            <html>
                <body>
                    <h2><strong>今日摘要</strong></h2>
                    <pre><code>这是今日摘要</code></pre>
                    <h3>产品与功能更新<span id=产品与功能更新></span></h3>
                    <ol>
                        <li><a href=https://example.com/openai>OpenAI 发布新模型</a></li>
                        <li><a href='https://example.com/google'>Google 更新 AI 搜索</a></li>
                    </ol>
                    <h3>前沿研究<span id=前沿研究></span></h3>
                    <ol><li><a href='https://example.com/research'>MIT 新研究</a></li></ol>
                    <h2><strong>AI资讯日报多渠道</strong></h2>
                </body>
            </html>
        `;

        const items = parseDailyDigestItems(html, 'https://ai.hubtoday.app/2026-03/2026-03-26/');

        expect(items).toEqual([
            {
                title: 'OpenAI 发布新模型',
                url: 'https://example.com/openai',
                lineIndex: 0,
                contextSnippet: 'OpenAI 发布新模型',
            },
            {
                title: 'Google 更新 AI 搜索',
                url: 'https://example.com/google',
                lineIndex: 0,
                contextSnippet: 'Google 更新 AI 搜索',
            },
            {
                title: 'MIT 新研究',
                url: 'https://example.com/research',
                lineIndex: 1,
                contextSnippet: 'MIT 新研究',
            },
        ]);
    });

    it('extracts the daily summary text from the code block', () => {
        const html = `
            <html>
                <body>
                    <h2><strong>今日摘要</strong></h2>
                    <div>
                        <pre><code>第一行摘要
第二行摘要</code></pre>
                    </div>
                    <h2><strong>AI资讯日报多渠道</strong></h2>
                </body>
            </html>
        `;

        expect(parseDailyDigestSummaryText(html)).toBe('第一行摘要\n第二行摘要');
    });
});
