# SciFact Mini 检索评测集

这是为静态 Demo 固化的一个小型检索评测子集，来源于 Allen Institute for AI 发布的 SciFact。它包含：

- 11 篇完整科学摘要，作为只读知识库语料；
- 6 条带 Gold 文档和 Gold 句子位置的 claim，作为检索评测题；
- 固定的融合排序与 Rerank 排序 fixture，保证纯前端 Demo 可重复运行。

本子集只用于验证产品内的评测数据结构、指标计算与交互，不是官方 SciFact 完整测试集，也不能把这里的分数与 SciFact 或 BEIR 榜单直接比较。

冻结清单：

- claim IDs：`49`、`53`、`70`、`115`、`118`、`124`；
- corpus document IDs：`4414547`、`4709641`、`4883040`、`5953485`、`5956380`、`6372244`、`13734012`、`14717500`、`33872649`、`45638119`、`49556906`；
- 抽取日期：2026-09-03；
- 官方 `data.tar.gz` 本次下载的 SHA-256：`11c621288d41ac144d29b13b0f8503b3820b7d6e8b1f6ff24dff335c196d76be`。

## 来源与许可

- 官方项目与数据说明：https://github.com/allenai/scifact
- 官方数据下载：https://scifact.s3-us-west-2.amazonaws.com/release/latest/data.tar.gz
- 官方许可说明：https://github.com/allenai/scifact/blob/master/LICENSE.md
- 论文：David Wadden et al., *Fact or Fiction: Verifying Scientific Claims*, EMNLP 2020

SciFact 官方许可说明中：

- claims 与 evidence annotations 使用 **CC BY 4.0**；
- corpus abstracts 来自 S2ORC，使用 **ODC-By 1.0**；
- 项目代码使用 **Apache 2.0**。

使用或再分发时需保留上述来源、作者与许可归属。请在产品正式商用前让法务再次确认具体归因展示方式。

## Demo 口径

- `dataset.js` 是本地运行数据源；页面不请求外网。
- Gold 只参与评分，不参与排序。
- Recall@K、Precision@K 与 MRR@K 对 6 条有效题做宏平均。
- “检索时延”是静态 Demo 的确定性模拟值，页面会明确标注；接入真实检索服务后应替换为服务端实测时延。
- Ragas 是评测／测试集生成框架，并不自带一个适用于所有业务的标准知识库。本数据集独立于 Ragas，可把同一结果适配给 Ragas 或 DeepEval。
