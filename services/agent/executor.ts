import { FAQService } from '../faq';
import { LIBRARY_SCRIPTS } from './automation/library';
import { agentBridge } from './bridge';
import { callDeepSeekStream } from './llm';
import { getAllUserFacts, saveMemoryFact } from './memory';
import { TOOLS } from './tools';
import { AgentContext, AgentResponse, AgentStep } from './types';

/**
 * The AgentExecutor handles the ReAct (Reasoning + Acting) loop.
 * It coordinates between the LLM and the local Tools.
 */
export class AgentExecutor {
    private context: AgentContext;

    constructor(userId: string) {
        this.context = {
            userId,
            sessionId: `session_${Date.now()}`,
            history: []
        };
    }

    /**
     * Main entry point for user prompts
     */
    async process(prompt: string, onUpdate?: (text: string) => void): Promise<AgentResponse> {
        this.context.history.push({ role: 'user', content: prompt });

        let currentStep = 0;
        const maxSteps = 5;
        const steps: AgentStep[] = [];

        while (currentStep < maxSteps) {
            // 1. Ask real LLM for next step
            const decision = await this.realDeepSeekCall(prompt, steps, onUpdate);
            steps.push(decision);

            if (!decision.action) {
                // No more actions, the LLM has provided the final answer
                break;
            }

            // 2. Execute the Tool
            const observation = await this.executeTool(decision.action.tool, decision.action.input);
            decision.observation = observation;

            currentStep++;
        }

        return {
            steps,
            finalAnswer: steps[steps.length - 1].reply || steps[steps.length - 1].thought
        };
    }

    private async executeTool(toolName: string, input: any): Promise<string> {
        console.log(`[Agent] Executing tool: ${toolName}`, input);

        // Real and Mock tool implementations
        switch (toolName) {
            case 'get_user_profile':
                const facts = await getAllUserFacts(this.context.userId);
                if (Object.keys(facts).length === 0) {
                    return JSON.stringify({ major: 'Computer Science', hall: 'Hall 1', status: 'First Time User' });
                }
                return JSON.stringify(facts);
            case 'save_user_preference':
                await saveMemoryFact(this.context.userId, input.key, input.value);
                return `Successfully remembered that your ${input.key} is ${input.value}.`;
            case 'search_canteen_menu':
                return "Nearby Harmony Cafeteria has 'Spicy Chicken' on special today. It's only 5 mins from Hall 1.";
            case 'check_library_availability':
                try {
                    const result = await agentBridge.injectAndObserve(LIBRARY_SCRIPTS.SCAN_SLOTS, 'LIBRARY_SCAN_RESULT');
                    const availCount = (result.slots as any[]).filter(s => s.status === 'available').length;
                    return `I scanned the library page and found ${availCount} available slots.`;
                } catch (e) {
                    console.warn('[Agent] Real-time scan failed, using mock data.', e);
                    return "Floor 3 has 15 individual carrels available at the moment.";
                }
            case 'book_library_seat':
                return "Seat reservation initiated. Please confirm the time on the screen.";
            case 'search_campus_faq':
                // 1. Search local legacy FAQs
                const localResults = FAQService.searchFAQs(input.query);

                // 2. Search new Supabase Knowledge Base (73 chunks)
                const kbResults = await FAQService.searchKnowledgeBase(input.query);

                if (localResults.length === 0 && kbResults.length === 0) {
                    return "I couldn't find a specific answer in the official documents for that query. You might want to check the HKBU website directly.";
                }

                let responseText = "Here is what I found in the official HKBU records:\n\n";

                if (kbResults.length > 0) {
                    responseText += "### Official Student Handbook & Knowledge Base:\n";
                    responseText += kbResults.map((kb: any) => `- ${kb.content}`).join('\n\n');
                    responseText += "\n\n";
                }

                if (localResults.length > 0) {
                    responseText += "### Quick FAQ Reference:\n";
                    responseText += localResults.map(f => `Q: ${f.question_zh}\nA: ${f.answer_zh}`).join('\n\n');
                }

                return responseText;
            default:
                return `Error: Tool ${toolName} not found.`;
        }
    }

    private async realDeepSeekCall(prompt: string, previousSteps: AgentStep[], onUpdate?: (text: string) => void): Promise<AgentStep> {
        const systemPrompt = `You are "HKCampus Assistant" (浸大领航员), the exclusive AI assistant for Hong Kong Baptist University (HKBU) students.

## Your Persona & Tone:
1. You are a friendly, knowledgeable, and enthusiastic senior student at HKBU.
2. You speak naturally, concisely, and use emojis where appropriate.
3. Your primary language for replies is Chinese, but you can understand English perfectly. You may mix in common HKBU English slang (e.g., "Reg course", "AAB", "Main Lib", "Canteen").

## Core Rules & Boundaries:
1. EXCLUSIVE DOMAIN: You ONLY answer questions related to HKBU campus life, academic affairs, campus facilities (library, canteens, classrooms, dorms), student activities, and the HKCampus app.
2. REFUSAL POLICY: If a user asks a question completely unrelated to HKBU or university life (e.g., "Write a script", "Who is the US president", "Explain physics"), you MUST politely decline and steer the conversation back to campus topics.
   Example: "哈哈，这个问题超纲啦！作为你的专属校园助手，我更擅长带你吃遍浸大、找空闲课室或者抢图书馆座位哦。校园生活有什么需要帮忙的吗？🎓"
3. HONESTY: Do not hallucinate facts. If you do not know the answer, use a tool to find it.

Available Tools:
${JSON.stringify(TOOLS, null, 2)}

ReAct Protocol & Optimization:
1. If you NEED to use a tool, output ONLY "thought" (max 10 words) and "action".
2. If you CAN answer directly, output ONLY "reply" (generate this immediately so the user can see it streaming). DO NOT output "thought".

Response Format (JSON only):
{
  "thought": "Brief reasoning ONLY IF using a tool",
  "action": { "tool": "tool_name", "input": { "param": "value" } }, // ONLY IF using a tool
  "reply": "Your final response in Chinese (ONLY IF NOT using a tool)"
}

Current context:
- User Prompt: ${prompt}
- Progress so far: ${JSON.stringify(previousSteps)}`;

        try {
            const llmOutput = await callDeepSeekStream([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ], (currentJsonStr) => {
                if (onUpdate) {
                    const match = currentJsonStr.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
                    if (match) {
                        try {
                            // Safely unescape the partial JSON string
                            let unescaped = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                            onUpdate(unescaped);
                        } catch (e) { }
                    }
                }
            });

            // Clean up potentially backticked JSON
            const jsonStr = llmOutput.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(jsonStr);

            return {
                thought: result.thought,
                reply: result.reply,
                action: result.action
            };
        } catch (e) {
            console.error('[Agent] Real LLM call failed, falling back to basic mock.', e);
            return { thought: "抱歉，由于网络或 API 问题，我暂时无法进行深度推理。请稍后再试。" };
        }
    }
}
