# 数据智能分析工具 Demo

这是一个无需构建和第三方 npm 依赖的静态演示，用同一个入口呈现两类工作流：

- **用户端**：铜采购签约案例、对话、附件、分析计划、知识检索、Web Search、计算、引用、报告预览和思考修订。
- **运营端**：知识库、公共文档池、文档解析与切片、检索配置、企业数据接入、外部信息源、模型管理、API Key 和消耗统计。

所有功能都运行在浏览器内存中的 Mock 数据上，适合产品演示、交互验收和前端流程检查。

## 快速开始

环境要求：

- Python 3：启动静态服务器
- Node.js：运行语法和流程检查

在 `demo/` 目录执行：

```bash
npm run serve
```

然后打开：

| 场景 | 地址 |
| --- | --- |
| 用户端首页 | <http://127.0.0.1:8780/> |
| 铜采购案例 | <http://127.0.0.1:8780/#/chat/copper-decision> |
| 用户端 Agent API | <http://127.0.0.1:8780/#/agent-api> |
| 运营端知识库 | <http://127.0.0.1:8780/#/knowledge> |
| 运营端公共文档池 | <http://127.0.0.1:8780/#/local-documents> |

## 运行方式

`index.html` 是唯一页面入口。`src/launcher.js` 根据 Hash 路由判断当前模式，并按依赖顺序加载用户端或运营端的样式和脚本。

用户端常用路由：

- `#/chat/new`
- `#/chat/copper-decision`
- `#/agent-api`

运营端常用路由：

- `#/knowledge`
- `#/local-documents`
- `#/enterprise-connections`
- `#/external-information`
- `#/models`
- `#/retrieval-config`
- `#/retrieval-test`
- `#/api-access`
- `#/consumption`

## 目录结构

```text
demo/
├── index.html                  # 统一入口
├── package.json                # 启动和检查命令
├── assets/
│   ├── css/
│   │   ├── tokens.css          # 共用设计令牌
│   │   ├── client/             # 用户端样式
│   │   └── ops/                # 运营端样式
│   ├── documents/supply-chain/ # 供应链示例文件
│   └── vendor/                 # Lucide、ECharts 及许可证
├── src/
│   ├── launcher.js             # 模式识别和资源加载
│   ├── client/                 # 用户端 Fixture 与交互逻辑
│   └── ops/                    # 运营端状态、动作、页面和 UI 模块
└── tests/
    ├── client/                 # 用户端静态、流程和响应状态检查
    └── ops/                    # 运营端闭环、目录和 RAG 生命周期检查
```

运营端采用 `actions → store → selectors` 的本地状态链路。后续接入真实服务时，可以优先替换动作层和数据访问层。

## 测试

运行全部检查：

```bash
npm test
```

只检查用户端：

```bash
npm run test:client
```

只检查运营端：

```bash
npm run test:ops
```

检查内容包括：

- JavaScript 语法和入口资源引用
- 统一入口与模式切换
- 用户端对话、分析流程、引用和响应版本状态
- 运营端知识库、文档目录、检索 API Key 和管理闭环
- 文件上传、解析、切片、索引和 RAG 生命周期

测试直接使用 Node.js 内置能力，不需要执行 `npm install`。

## Demo 边界

- 数据和动作均为浏览器内存中的 Mock，刷新页面后恢复预置状态。
- 不连接真实模型、知识库、企业数据库、Web Search、对象存储、任务队列或向量数据库。
- 页面中的上传、解析、切片、向量化、索引和连接测试用于流程演示，不代表真实后端处理。
- 示例文档只用于预览和下载演示；API Key 只在创建交互中短暂展示，不具备真实鉴权能力。
- 当前主要覆盖桌面端产品形态，生产级权限、安全、审计和移动端适配不在范围内。

## 静态部署

`demo/` 可以部署到静态文件服务器或 GitHub Pages。请保持目录结构和相对路径不变，并从站点根路径访问。由于页面使用 Hash 路由，部署后可直接使用本文档中的地址访问各个场景。

## 维护约定

- 新增页面或资源时，先更新 `src/launcher.js` 中对应模式的清单，再补充相应检查。
- 不把截图、对比 HTML、一次性审计记录和本地 Playwright 输出放回运行目录。
- 保留供应商库许可证：`assets/vendor/LICENSE.lucide.txt` 和 `assets/vendor/LICENSE.echarts.txt`。
