# 预置模型信息

核对日期：2026-09-09。模型名称、参数规模、向量维度和输入长度依据下列官方模型卡与作者说明整理。

## LLM 模型

| 展示名称 | 官方模型标识 | 总参数 / 激活参数 | 输入上限 | 能力说明 |
| --- | --- | --- | --- | --- |
| DeepSeek-V4-Pro | [deepseek-ai/DeepSeek-V4-Pro](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro) | 1.6T / 49B | 1M tokens | MIT 许可的 MoE 模型；面向推理、代码、Agent 和长上下文任务。 |
| Qwen3.8-2.4T-A95B | [Qwen/Qwen3.8-2.4T-A95B](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B) | 2.4T / 95B | 262144 tokens | Qwen3.8 旗舰 MoE 模型；可扩展至 1010000 tokens，面向复杂分析、代码与长时程 Agent 任务。 |
| Qwen3.5-397B-A17B | [Qwen/Qwen3.5-397B-A17B](https://huggingface.co/Qwen/Qwen3.5-397B-A17B) | 397B / 17B | 262144 tokens | 大规模 MoE 模型；支持多模态理解、推理与工具调用。 |

页面以总参数判定规模，新增 LLM 时不允许低于 25B。默认回答生成引用 DeepSeek-V4-Pro。

## 向量模型

| 展示名称 | 官方模型标识 | 预置向量维度 | 输入上限 | 能力说明 |
| --- | --- | ---: | --- | --- |
| Qwen3-Embedding-8B | [Qwen/Qwen3-Embedding-8B](https://huggingface.co/Qwen/Qwen3-Embedding-8B) | 4096 | 32K tokens | 8B 参数；支持多语言、代码检索与指令输入，支持 32–4096 维输出。 |
| Qwen3-Embedding-4B | [Qwen/Qwen3-Embedding-4B](https://huggingface.co/Qwen/Qwen3-Embedding-4B) | 2560 | 32K tokens | 4B 参数；支持多语言、代码检索与指令输入，支持 32–2560 维输出。 |
| bge-m3 | [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) | 1024 | 8192 tokens | 支持多语言、稠密检索、稀疏检索及多向量检索；本演示使用稠密向量。 |

4096 和 2560 分别是这两个 Qwen 模型的最大输出维度，本演示采用这两个维度。所有预置知识库和文档处理策略均绑定 Qwen3-Embedding-8B，相关维度快照统一为 4096。

## Rerank 模型

| 展示名称 | 官方模型标识 | 输入上限 | 能力说明 |
| --- | --- | --- | --- |
| Qwen3-Reranker-0.6B | [Qwen/Qwen3-Reranker-0.6B](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B) | 32K tokens | 0.6B 参数；支持多语言和任务指令，对查询与候选文本进行相关性评分。 |
| Qwen3-Reranker-4B | [Qwen/Qwen3-Reranker-4B](https://huggingface.co/Qwen/Qwen3-Reranker-4B) | 32K tokens | 4B 参数；支持多语言和任务指令，对查询与候选文本进行相关性评分。 |
| bge-reranker-v2-m3 | [BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3) | 最大 8192 tokens；作者建议 1024 | 基于 BGE-M3 的多语言交叉编码器重排模型。 |
| jina-reranker-v3.5 | [jinaai/jina-reranker-v3.5](https://huggingface.co/jinaai/jina-reranker-v3.5) | 131072 tokens，共享窗口 | 0.6B 参数；多语言列表式重排，支持多个候选文档联合排序。 |

- 向量模型使用 `bge-m3`，重排模型使用 `bge-reranker-v2-m3`；二者是不同模型。Qwen 4B 重排模型的官方拼写为 `Qwen3-Reranker-4B`，保留大写 B。
- BGE 重排模型的推荐长度与最大长度区分依据：[BAAI 作者说明](https://huggingface.co/BAAI/bge-reranker-v2-m3/discussions/2)。
- Jina 的上下文由查询和所有候选文档共享，不能把 131072 tokens 理解为每篇文档的额度。详见 [Jina v3.5 官方模型卡](https://huggingface.co/jinaai/jina-reranker-v3.5)。
- 全局检索默认选择 Qwen3-Reranker-0.6B；Rerank 模型不设置向量维度。

## Demo 接入信息

模型管理中预置 3 个 LLM、3 个向量模型和 4 个 Rerank 模型。列表显示模型名称、参数规模（仅 LLM）、向量维度（仅向量模型）、连接状态和操作。页面中的 API 地址采用 `model-gateway.internal/models/<型号>/v1/chat/completions`、`/v1/embeddings` 或 `/v1/rerank`，均为本地模拟配置，并非官方 API 地址。连接状态、测试时间、测试结果和脱敏密钥同样为演示数据，不会发起真实模型调用。

名称、绑定关系、连接测试、参数规模和向量维度在演示流程中保持联动。
