import * as llm from '../../../services/agent/llm';
import {
    extractMemoryCandidatesFromConversation,
    filterMemoryCandidates,
    normalizeMemoryKey,
} from '../../../services/agent/memory_extractor';
import type { MemoryCandidate } from '../../../services/agent/types';

jest.mock('../../../services/agent/llm');

describe('normalizeMemoryKey', () => {
    it('lowercases and normalizes spaces', () => {
        expect(normalizeMemoryKey('Favorite Food')).toBe('favorite_food');
    });

    it('merges canonical variants', () => {
        expect(normalizeMemoryKey('food_preference')).toBe('favorite_food');
        expect(normalizeMemoryKey('study_abroad_plan')).toBe('future_plan.exchange');
        expect(normalizeMemoryKey('preferred_name')).toBe('nickname');
    });

    it('rejects generic keys', () => {
        expect(normalizeMemoryKey('info')).toBeNull();
    });
});

describe('filterMemoryCandidates', () => {
    it('keeps durable memories and applies deterministic rejections', () => {
        const candidates: MemoryCandidate[] = [
            {
                should_store: true,
                key: 'food_preference',
                value: 'likes spicy food',
                memory_type: 'long_term_preference',
                confidence: 0.91,
                reason: 'stable food preference',
            },
            {
                should_store: true,
                key: 'study_abroad_plan',
                value: 'exchange next term',
                memory_type: 'background_fact',
                confidence: 0.9,
                reason: 'durable future plan',
            },
            {
                should_store: true,
                key: 'nickname',
                value: 'Tim',
                memory_type: 'long_term_preference',
                confidence: 0.98,
                reason: 'preferred name',
            },
            {
                should_store: true,
                key: 'major',
                value: 'Computer Science',
                memory_type: 'background_fact',
                confidence: 0.7,
                reason: 'below confidence threshold',
            },
            {
                should_store: true,
                key: 'mood_today',
                value: 'feeling stressed today',
                memory_type: 'emotion',
                confidence: 0.94,
                reason: 'temporary emotion',
            },
            {
                should_store: true,
                key: 'info',
                value: 'generic key should be rejected',
                memory_type: 'background_fact',
                confidence: 0.95,
                reason: 'generic key',
            },
            {
                should_store: true,
                key: 'passport_number',
                value: 'passport 1234567890',
                memory_type: 'background_fact',
                confidence: 0.96,
                reason: 'sensitive value',
            },
            {
                should_store: true,
                key: 'long_form_note',
                value: 'x'.repeat(161),
                memory_type: 'background_fact',
                confidence: 0.96,
                reason: 'too long',
            },
        ];

        expect(
            filterMemoryCandidates(candidates, {
                nickname: 'Tim',
            })
        ).toEqual([
            {
                should_store: true,
                key: 'favorite_food',
                value: 'likes spicy food',
                memoryType: 'long_term_preference',
                confidence: 0.91,
                reason: 'stable food preference',
            },
            {
                should_store: true,
                key: 'future_plan.exchange',
                value: 'exchange next term',
                memoryType: 'background_fact',
                confidence: 0.9,
                reason: 'durable future plan',
            },
        ]);
    });

    it('caps accepted memories to three results', () => {
        const candidates: MemoryCandidate[] = [
            {
                should_store: true,
                key: 'preferred_name',
                value: 'Tim',
                memory_type: 'long_term_preference',
                confidence: 0.99,
                reason: 'name',
            },
            {
                should_store: true,
                key: 'favorite_food',
                value: 'dumplings',
                memory_type: 'long_term_preference',
                confidence: 0.98,
                reason: 'food',
            },
            {
                should_store: true,
                key: 'major',
                value: 'Computer Science',
                memory_type: 'background_fact',
                confidence: 0.97,
                reason: 'major',
            },
            {
                should_store: true,
                key: 'future_plan',
                value: 'study abroad',
                memory_type: 'background_fact',
                confidence: 0.96,
                reason: 'future plan',
            },
        ];

        expect(filterMemoryCandidates(candidates, {})).toEqual([
            {
                should_store: true,
                key: 'nickname',
                value: 'Tim',
                memoryType: 'long_term_preference',
                confidence: 0.99,
                reason: 'name',
            },
            {
                should_store: true,
                key: 'favorite_food',
                value: 'dumplings',
                memoryType: 'long_term_preference',
                confidence: 0.98,
                reason: 'food',
            },
            {
                should_store: true,
                key: 'major',
                value: 'Computer Science',
                memoryType: 'background_fact',
                confidence: 0.97,
                reason: 'major',
            },
        ]);
    });

    it('rejects conflicting writes for the same normalized key in one batch', () => {
        const candidates: MemoryCandidate[] = [
            {
                should_store: true,
                key: 'preferred_name',
                value: 'Tim',
                memory_type: 'long_term_preference',
                confidence: 0.99,
                reason: 'name preference',
            },
            {
                should_store: true,
                key: 'nickname',
                value: 'Timothy',
                memory_type: 'long_term_preference',
                confidence: 0.98,
                reason: 'conflicting name preference',
            },
            {
                should_store: true,
                key: 'favorite_food',
                value: 'dumplings',
                memory_type: 'long_term_preference',
                confidence: 0.97,
                reason: 'food',
            },
        ];

        expect(filterMemoryCandidates(candidates, {})).toEqual([
            {
                should_store: true,
                key: 'nickname',
                value: 'Tim',
                memoryType: 'long_term_preference',
                confidence: 0.99,
                reason: 'name preference',
            },
            {
                should_store: true,
                key: 'favorite_food',
                value: 'dumplings',
                memoryType: 'long_term_preference',
                confidence: 0.97,
                reason: 'food',
            },
        ]);
    });
});

describe('extractMemoryCandidatesFromConversation', () => {
    it('parses structured candidate memories from the LLM response', async () => {
        (llm.callDeepSeek as jest.Mock).mockResolvedValue(
            JSON.stringify({
                candidates: [
                    {
                        should_store: true,
                        key: 'preferred_name',
                        value: 'Tim',
                        memory_type: 'long_term_preference',
                        confidence: 0.96,
                        reason: 'user explicitly said to call them Tim',
                    },
                ],
            })
        );

        const result = await extractMemoryCandidatesFromConversation({
            recentTurns: [
                { role: 'user', content: 'Please call me Tim from now on.' },
                { role: 'assistant', content: 'Okay, I will remember that.' },
            ],
        });

        expect(result).toEqual([
            {
                should_store: true,
                key: 'preferred_name',
                value: 'Tim',
                memory_type: 'long_term_preference',
                confidence: 0.96,
                reason: 'user explicitly said to call them Tim',
            },
        ]);
    });

    it('extracts the first JSON object from noisy LLM output', async () => {
        (llm.callDeepSeek as jest.Mock).mockResolvedValue(
            [
                'Here is the extracted memory JSON:',
                '{"candidates":[{"should_store":true,"key":"favorite_food","value":"dumplings","memory_type":"long_term_preference","confidence":0.93,"reason":"user said it is their favorite food"}]}',
                'Let me know if you want anything else.',
            ].join('\n')
        );

        const result = await extractMemoryCandidatesFromConversation({
            recentTurns: [
                { role: 'user', content: 'My favorite food is dumplings.' },
                { role: 'assistant', content: 'That sounds good.' },
            ],
        });

        expect(result).toEqual([
            {
                should_store: true,
                key: 'favorite_food',
                value: 'dumplings',
                memory_type: 'long_term_preference',
                confidence: 0.93,
                reason: 'user said it is their favorite food',
            },
        ]);
    });
});
