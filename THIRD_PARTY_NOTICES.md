# 第三方来源

## ECDICT

- 上游：https://github.com/skywind3000/ECDICT
- 固定提交：`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`
- 输入文件：`ecdict.csv`
- 输入 SHA-256：`1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`
- 本项目加工：保留有考试标签、Oxford 标记或 BNC/FRQ 正数排名不高于 30,000 的条目；提取中文释义与音标，转为按首字母分片的 JSON。共 37,019 条。
- 上游声明 MIT License；完整原始许可附于 [ECDICT-LICENSE.txt](extension/data/ECDICT-LICENSE.txt)。上游版权信息原样保留。

许可与来源已随可加载扩展一起打包。没有运行时词典下载或云端词典依赖。

## API 协议参考（2026-10-19 核对）

- Gemini generateContent：https://ai.google.dev/api/generate-content
- DeepSeek Chat Completions：https://api-docs.deepseek.com/api/create-chat-completion
- OpenRouter Chat Completions：https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- 浏览器 Commands API：https://developer.chrome.com/docs/extensions/reference/api/commands
- 微软 Translator v3 Translate：https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate
- 微软认证与区域：https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication

参考官方协议编写独立适配，不包含服务商 SDK 或共享密钥；未硬编码当前模型与价格。
