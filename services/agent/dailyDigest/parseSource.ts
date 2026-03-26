import { DAILY_DIGEST_CONFIG } from './config';
import { DigestItem } from './types';

const stripTags = (input: string): string => input.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const decodeHtmlEntities = (input: string): string => input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();

const linkRegex = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))[^>]*>([\s\S]*?)<\/a>/gi;

const SUMMARY_START_MARKERS = ['<strong>今日摘要</strong>', '>今日摘要<', 'id=今日摘要'];

const stripTagsPreservingLines = (input: string): string => input.replace(/<[^>]+>/g, '');
const headingRegex = /<h3[^>]*>\s*(?:<strong>)?([^<]+?)(?:<\/strong>)?\s*<span[^>]*id=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
type SectionMatch = {
    start: number,
    end: number,
    title: string,
    anchorId: string,
};

const extractDigestHtml = (html: string): string => {
    const lowerHtml = html.toLowerCase();
    const sectionIndex = SUMMARY_START_MARKERS
        .map((keyword) => lowerHtml.indexOf(keyword.toLowerCase()))
        .find((index) => index >= 0);

    if (sectionIndex === undefined || sectionIndex < 0) {
        return html;
    }

    const endIndex = DAILY_DIGEST_CONFIG.sectionKeywords
        .map((keyword) => lowerHtml.indexOf(keyword.toLowerCase(), sectionIndex))
        .find((index) => index > sectionIndex);

    if (endIndex === undefined || endIndex < 0) {
        return html.slice(sectionIndex);
    }

    return html.slice(sectionIndex, endIndex);
};

const normalizeUrl = (href: string, sourceUrl: string): string | null => {
    try {
        const absolute = new URL(href, sourceUrl).toString();
        if (!absolute.startsWith('http://') && !absolute.startsWith('https://')) {
            return null;
        }
        return absolute;
    } catch {
        return null;
    }
};

const normalizeSnippet = (input: string): string => decodeHtmlEntities(stripTags(input))
    .replace(/\s+/g, ' ')
    .trim();

const extractContextSnippet = (html: string, anchorStart: number, anchorEnd: number): string => {
    const before = html.slice(0, anchorStart);
    const after = html.slice(anchorEnd);

    const blockStartCandidates = [
        before.lastIndexOf('<li'),
        before.lastIndexOf('<p'),
    ].filter((index) => index >= 0);
    const blockStart = blockStartCandidates.length > 0 ? Math.max(...blockStartCandidates) : 0;

    const liClose = after.indexOf('</li>');
    const pClose = after.indexOf('</p>');
    const closeCandidates = [liClose, pClose].filter((index) => index >= 0);
    const relativeEnd = closeCandidates.length > 0 ? Math.min(...closeCandidates) : Math.min(after.length, 400);
    const blockEnd = anchorEnd + relativeEnd + (closeCandidates.length > 0 ? 5 : 0);

    return normalizeSnippet(html.slice(blockStart, blockEnd));
};

const collectLinks = (html: string, sourceUrl: string): DigestItem[] => {
    const links: DigestItem[] = [];
    let match: RegExpExecArray | null = linkRegex.exec(html);

    while (match) {
        const href = decodeHtmlEntities(match[1] || match[2] || match[3] || '');
        const titleRaw = decodeHtmlEntities(stripTags(match[4] || ''));
        const normalizedUrl = normalizeUrl(href, sourceUrl);
        const contextSnippet = extractContextSnippet(html, match.index, match.index + match[0].length);

        if (normalizedUrl && titleRaw && titleRaw.length > 3) {
            links.push({
                title: titleRaw,
                url: normalizedUrl,
                contextSnippet,
            });
        }

        match = linkRegex.exec(html);
    }

    return links;
};

const collectSectionMatches = (html: string): SectionMatch[] => {
    const sections: SectionMatch[] = [];
    let match: RegExpExecArray | null = headingRegex.exec(html);

    while (match) {
        const title = decodeHtmlEntities(stripTags(match[1] || ''));
        const anchorId = decodeHtmlEntities(match[2] || match[3] || match[4] || '');
        sections.push({
            start: match.index,
            end: match.index + match[0].length,
            title,
            anchorId,
        });
        match = headingRegex.exec(html);
    }

    return sections;
};

export const parseDailyDigestItems = (html: string, sourceUrl: string): DigestItem[] => {
    const digestHtml = extractDigestHtml(html);
    const sectionMatches = collectSectionMatches(digestHtml);
    const candidateLinks: DigestItem[] = [];

    if (sectionMatches.length > 0) {
        sectionMatches.forEach((section, index) => {
            const nextSection = sectionMatches[index + 1];
            const sectionHtml = digestHtml.slice(section.end, nextSection ? nextSection.start : digestHtml.length);
            const sectionLinks = collectLinks(sectionHtml, sourceUrl).map((item) => ({
                ...item,
                lineIndex: index,
            }));

            if (sectionLinks.length > 0) {
                candidateLinks.push(...sectionLinks);
                return;
            }

            const anchorUrl = normalizeUrl(`#${section.anchorId}`, sourceUrl);
            if (anchorUrl) {
                candidateLinks.push({
                    title: section.title,
                    url: anchorUrl,
                    lineIndex: index,
                });
            }
        });
    } else {
        candidateLinks.push(...collectLinks(digestHtml, sourceUrl));
    }

    const unique = new Map<string, DigestItem>();

    for (const item of candidateLinks) {
        if (item.url.includes('ai.hubtoday.app') && item.title.includes('AI资讯日报')) {
            continue;
        }
        const key = `${item.title}|${item.url}`;
        if (!unique.has(key)) {
            unique.set(key, item);
        }
        if (unique.size >= DAILY_DIGEST_CONFIG.maxItems) {
            break;
        }
    }

    return Array.from(unique.values());
};

export const parseDailyDigestSummaryText = (html: string): string | null => {
    const digestHtml = extractDigestHtml(html);
    const match = digestHtml.match(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/i);

    if (!match) {
        return null;
    }

    const summary = decodeHtmlEntities(stripTagsPreservingLines(match[1]))
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .replace(/\n{2,}/g, '\n')
        .trim();

    return summary || null;
};
