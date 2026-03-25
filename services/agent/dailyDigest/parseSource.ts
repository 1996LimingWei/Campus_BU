import { DAILY_DIGEST_CONFIG } from './config';
import { DigestItem } from './types';

const stripTags = (input: string): string => input.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const decodeHtmlEntities = (input: string): string => input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const extractSectionHtml = (html: string): string => {
    const normalized = html.replace(/\n/g, ' ');
    const sectionIndex = DAILY_DIGEST_CONFIG.sectionKeywords
        .map((keyword) => normalized.toLowerCase().indexOf(keyword.toLowerCase()))
        .find((index) => index >= 0);

    if (sectionIndex === undefined || sectionIndex < 0) {
        return normalized;
    }

    const nextHeading = normalized.slice(sectionIndex + 1).search(/<h1|<h2|<h3/i);
    if (nextHeading < 0) {
        return normalized.slice(sectionIndex);
    }

    return normalized.slice(sectionIndex, sectionIndex + 1 + nextHeading);
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

const collectLinks = (html: string, sourceUrl: string): DigestItem[] => {
    const links: DigestItem[] = [];
    const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match: RegExpExecArray | null = regex.exec(html);

    while (match) {
        const href = decodeHtmlEntities(match[1] || '');
        const titleRaw = decodeHtmlEntities(stripTags(match[2] || ''));
        const normalizedUrl = normalizeUrl(href, sourceUrl);

        if (normalizedUrl && titleRaw && titleRaw.length > 3) {
            links.push({
                title: titleRaw,
                url: normalizedUrl,
            });
        }

        match = regex.exec(html);
    }

    return links;
};

export const parseDailyDigestItems = (html: string, sourceUrl: string): DigestItem[] => {
    const sectionHtml = extractSectionHtml(html);
    const sectionLinks = collectLinks(sectionHtml, sourceUrl);
    const fallbackLinks = sectionLinks.length > 0 ? [] : collectLinks(html, sourceUrl);

    const candidateLinks = sectionLinks.length > 0 ? sectionLinks : fallbackLinks;
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
