import type { MemoryCandidate } from '../../../services/agent/types';
import { filterMemoryCandidates, normalizeMemoryKey } from '../../../services/agent/memory_extractor';

describe('memory extractor contracts', () => {
    const existingFacts = {
        nickname: 'Tim',
    };

    it('normalizes accepted keys', () => {
        expect(normalizeMemoryKey('Favorite Food')).toBe('favorite_food');
    });

    it('filters temporary emotional memories', () => {
        const candidates: MemoryCandidate[] = [
            {
                should_store: true,
                key: 'mood_today',
                value: 'feeling stressed today',
                memory_type: 'emotion',
                confidence: 0.92,
                reason: 'user said they feel stressed today',
            },
        ];

        expect(filterMemoryCandidates(candidates, existingFacts)).toEqual([]);
    });
});
