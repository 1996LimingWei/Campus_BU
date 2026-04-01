import { DAILY_DIGEST_CONFIG } from './config';
import { DigestItem } from './types';

const CLAUSE_DELIMITER_REGEX = /([、，,；;])/;

const normalizeForMatch = (input: string): string => input
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, '');

const toBigrams = (input: string): string[] => {
    const normalized = normalizeForMatch(input);
    if (!normalized) {
        return [];
    }
    if (normalized.length === 1) {
        return [normalized];
    }

    const grams: string[] = [];
    for (let index = 0; index < normalized.length - 1; index += 1) {
        grams.push(normalized.slice(index, index + 2));
    }
    return grams;
};

const scoreClauseMatch = (clause: string, candidateText: string): number => {
    const clauseNorm = normalizeForMatch(clause);
    const candidateNorm = normalizeForMatch(candidateText);
    if (!clauseNorm || !candidateNorm) {
        return 0;
    }

    if (clauseNorm.includes(candidateNorm) || candidateNorm.includes(clauseNorm)) {
        return Math.min(clauseNorm.length, candidateNorm.length) + 10;
    }

    const clauseBigrams = new Set(toBigrams(clauseNorm));
    const candidateBigrams = new Set(toBigrams(candidateNorm));
    let overlap = 0;
    clauseBigrams.forEach((gram) => {
        if (candidateBigrams.has(gram)) {
            overlap += 1;
        }
    });

    const lengthBonus = candidateNorm.split(/[a-z]+|\d+/i).length === 1 ? 0 : 0.5;
    return overlap + lengthBonus;
};

const injectRefsIntoLine = (line: string, refs: { label: string, matchText: string }[]): string => {
    if (refs.length === 0) {
        return line;
    }

    const parts = line.split(CLAUSE_DELIMITER_REGEX);
    const textSegments = parts.filter((_, index) => index % 2 === 0);
    const delimiters = parts.filter((_, index) => index % 2 === 1);

    if (textSegments.length <= 1) {
        return `${line}${refs.map((ref) => ref.label).join('')}`;
    }

    const refBuckets = textSegments.map(() => [] as string[]);
    refs.forEach((ref) => {
        let bestIndex = textSegments.length - 1;
        let bestScore = -1;

        textSegments.forEach((segment, index) => {
            const score = scoreClauseMatch(segment, ref.matchText);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });

        refBuckets[bestIndex].push(ref.label);
    });

    let rebuilt = '';
    for (let index = 0; index < textSegments.length; index += 1) {
        rebuilt += `${textSegments[index]}${refBuckets[index].join('')}`;
        if (delimiters[index]) {
            rebuilt += delimiters[index];
        }
    }

    return rebuilt;
};

export const composeDailyDigestMessage = (summary: string, items: DigestItem[]): string => {
    const summaryLines = summary
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    let refIndex = 1;
    const formattedLines = summaryLines.map((line, index) => {
        const lineRefs = items
            .filter((item) => item.lineIndex === index || (item.lineIndex === undefined && items.indexOf(item) === index))
            .slice(0, DAILY_DIGEST_CONFIG.maxRefsPerLine)
            .map((item) => ({
                label: `【${refIndex++}】(${item.url})`,
                matchText: item.contextSnippet || item.title,
            }))
        ;

        return `· ${injectRefsIntoLine(line, lineRefs)}`;
    });

    return formattedLines.join('\n');
};
