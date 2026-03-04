import { AGENT_CONFIG } from './config';

const DEEPSEEK_API_KEY = AGENT_CONFIG.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = AGENT_CONFIG.DEEPSEEK_BASE_URL;

export type LLMResponse = {
    content: string;
    stop_reason: string;
};

/**
 * DeepSeek LLM Service
 */
export async function callDeepSeek(messages: { role: string, content: string }[]): Promise<string> {
    try {
        const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages,
                temperature: 0.7,
                stream: false
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`DeepSeek API error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        console.error('[LLM] DeepSeek call failed:', e);
        throw e;
    }
}

export function callDeepSeekStream(
    messages: { role: string, content: string }[],
    onToken?: (text: string) => void
): Promise<string> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${DEEPSEEK_BASE_URL}/chat/completions`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${DEEPSEEK_API_KEY}`);

        let lastProcessedIndex = 0;
        let fullText = "";

        xhr.onreadystatechange = () => {
            if (xhr.readyState === 3 || xhr.readyState === 4) {
                const currentText = xhr.responseText || "";
                const newData = currentText.substring(lastProcessedIndex);
                lastProcessedIndex = currentText.length;

                const lines = newData.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('data: ') && !line.includes('[DONE]')) {
                        try {
                            const data = JSON.parse(line.trim().substring(6));
                            const chunk = data.choices[0]?.delta?.content || "";
                            fullText += chunk;
                            if (onToken) onToken(fullText);
                        } catch (e) {
                            // ignore parse errors for partial chunks
                        }
                    }
                }

                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        resolve(fullText);
                    } else {
                        reject(new Error(`API Error: ${xhr.status} ${xhr.responseText}`));
                    }
                }
            }
        };

        xhr.onerror = () => reject(new Error("Network Error"));

        xhr.send(JSON.stringify({
            model: 'deepseek-chat',
            messages,
            temperature: 0.7,
            stream: true
        }));
    });
}
