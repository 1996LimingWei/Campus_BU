import { composeDailyDigestMessage } from '../composeMessage';

describe('composeDailyDigestMessage', () => {
    it('formats each summary line with a clickable reference marker', () => {
        const message = composeDailyDigestMessage('这是第一条摘要\n这是第二条摘要', [
            { title: 'OpenAI 发布新模型', url: 'https://example.com/1', lineIndex: 0, contextSnippet: '这是第一条摘要' },
            { title: '即梦 AI', url: 'https://example.com/2', lineIndex: 0, contextSnippet: '这是第一条摘要' },
            { title: 'MIT 新研究', url: 'https://example.com/3', lineIndex: 1, contextSnippet: '这是第二条摘要' },
        ]);

        expect(message).toBe(
            '· 这是第一条摘要【1】(https://example.com/1)【2】(https://example.com/2)\n· 这是第二条摘要【3】(https://example.com/3)'
        );
    });

    it('injects references before dunhao or comma-separated clause boundaries', () => {
        const message = composeDailyDigestMessage('英伟达Nemotron Nano 12B、谷歌Lyria 3、TurboQuant及即梦3.0Pro等新模型密集发布', [
            { title: '英伟达', url: 'https://example.com/1', lineIndex: 0, contextSnippet: '英伟达Nemotron Nano 12B 发布' },
            { title: '谷歌', url: 'https://example.com/2', lineIndex: 0, contextSnippet: '谷歌Lyria 3 系列音乐模型上线' },
            { title: 'TurboQuant', url: 'https://example.com/3', lineIndex: 0, contextSnippet: 'TurboQuant 大幅压低推理成本' },
            { title: '即梦', url: 'https://example.com/4', lineIndex: 0, contextSnippet: '即梦3.0Pro 图像生成升级' },
        ]);

        expect(message).toBe(
            '· 英伟达Nemotron Nano 12B【1】(https://example.com/1)、谷歌Lyria 3【2】(https://example.com/2)、TurboQuant及即梦3.0Pro等新模型密集发布【3】(https://example.com/3)【4】(https://example.com/4)'
        );
    });

    it('matches references to the most relevant clause within the same section', () => {
        const message = composeDailyDigestMessage('英伟达Nemotron Nano 12B、谷歌Lyria 3、TurboQuant及即梦3.0Pro等新模型密集发布', [
            {
                title: '新闻 A',
                url: 'https://example.com/turbo',
                lineIndex: 0,
                contextSnippet: '谷歌宣布 TurboQuant 大幅压低推理成本，手机端运行更顺滑',
            },
            {
                title: '新闻 B',
                url: 'https://example.com/lyria',
                lineIndex: 0,
                contextSnippet: '谷歌正式推出 Lyria 3 系列音乐模型，支持更长音频生成',
            },
            {
                title: '新闻 C',
                url: 'https://example.com/nemotron',
                lineIndex: 0,
                contextSnippet: '英伟达发布 Nemotron Nano 12B，小参数模型能力增强',
            },
        ]);

        expect(message).toBe(
            '· 英伟达Nemotron Nano 12B【3】(https://example.com/nemotron)、谷歌Lyria 3【2】(https://example.com/lyria)、TurboQuant及即梦3.0Pro等新模型密集发布【1】(https://example.com/turbo)'
        );
    });
});
