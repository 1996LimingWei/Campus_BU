import { composeDailyDigestMessage } from '../composeMessage';

describe('composeDailyDigestMessage', () => {
    it('formats each summary line with clickable reference markers', () => {
        const message = composeDailyDigestMessage('First summary line\nSecond summary line', [
            { title: 'OpenAI release', url: 'https://example.com/1', lineIndex: 0, contextSnippet: 'First summary line' },
            { title: 'Anthropic update', url: 'https://example.com/2', lineIndex: 0, contextSnippet: 'First summary line' },
            { title: 'MIT research', url: 'https://example.com/3', lineIndex: 1, contextSnippet: 'Second summary line' },
        ]);

        expect(message).toBe(
            '· First summary line【1】(https://example.com/1)【2】(https://example.com/2)\n· Second summary line【3】(https://example.com/3)'
        );
    });

    it('injects references before comma-separated clause boundaries', () => {
        const message = composeDailyDigestMessage('OpenAI, Anthropic, Google, xAI latest updates', [
            { title: 'OpenAI', url: 'https://example.com/1', lineIndex: 0, contextSnippet: 'OpenAI latest updates' },
            { title: 'Anthropic', url: 'https://example.com/2', lineIndex: 0, contextSnippet: 'Anthropic latest updates' },
            { title: 'Google', url: 'https://example.com/3', lineIndex: 0, contextSnippet: 'Google latest updates' },
        ]);

        expect(message).toBe(
            '· OpenAI【1】(https://example.com/1), Anthropic【2】(https://example.com/2), Google, xAI latest updates'
        );
    });

    it('matches references to the most relevant clause within the same line', () => {
        const message = composeDailyDigestMessage('OpenAI, Anthropic, Google latest updates', [
            {
                title: 'Google',
                url: 'https://example.com/google',
                lineIndex: 0,
                contextSnippet: 'Google latest updates',
            },
            {
                title: 'Anthropic',
                url: 'https://example.com/anthropic',
                lineIndex: 0,
                contextSnippet: 'Anthropic latest updates',
            },
            {
                title: 'OpenAI',
                url: 'https://example.com/openai',
                lineIndex: 0,
                contextSnippet: 'OpenAI latest updates',
            },
        ]);

        expect(message).toBe(
            '· OpenAI, Anthropic【2】(https://example.com/anthropic), Google latest updates【1】(https://example.com/google)'
        );
    });

    it('limits each summary line to at most two references', () => {
        const message = composeDailyDigestMessage('OpenAI, Anthropic, Google, xAI latest updates', [
            { title: 'OpenAI', url: 'https://example.com/1', lineIndex: 0, contextSnippet: 'OpenAI latest updates' },
            { title: 'Anthropic', url: 'https://example.com/2', lineIndex: 0, contextSnippet: 'Anthropic latest updates' },
            { title: 'Google', url: 'https://example.com/3', lineIndex: 0, contextSnippet: 'Google latest updates' },
        ]);

        expect(message).toBe(
            '· OpenAI【1】(https://example.com/1), Anthropic【2】(https://example.com/2), Google, xAI latest updates'
        );
    });
});
