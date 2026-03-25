export interface DigestItem {
    title: string;
    url: string;
}

export interface DailyDigestPayload {
    digestId: string;
    date: string;
    sourceUrl: string;
    summary: string;
    items: DigestItem[];
    message: string;
    createdAt: string;
}

export interface DigestJobResult {
    ok: boolean;
    payload?: DailyDigestPayload;
    fromCache?: boolean;
    reason?: string;
}
