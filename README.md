# 数据智能分析工具 Demo

本目录是数据智能分析工具的统一演示项目，包含两个桌面 Web 子应用：

- `user-client/`：轻量用户端，用于演示对话、文件上传、分析过程、必要询问、结果交付和报告模板管理；
- `ops-console/`：运营端，用于演示知识库、数据接入、检索、模型、Skill、分析与输出等配置管理。

两个端属于同一个 Demo 项目，通过相对地址双向跳转；为避免样式、Mock 状态和路由相互影响，源码仍按子应用隔离。

点击侧栏底部的头像展开账户菜单：用户端选择“运营端”，运营端选择“用户端入口”，即可切换界面。

## 项目结构

```text
Data-Intelligence-Analysis/
├── index.html             默认跳转至用户端
├── package.json           统一启动与检查命令
├── user-client/           轻量用户端
├── ops-console/           运营端
└── tests/                 项目级检查
```

## 启动与访问

在项目根目录（包含 `package.json` 的目录）执行：

```bash
npm run serve
```

访问地址：

- 默认入口：`http://127.0.0.1:8780/`（自动进入用户端）
- 轻量用户端：`http://127.0.0.1:8780/user-client/#/chat/copper-decision`
- 用户端报告模板：`http://127.0.0.1:8780/user-client/#/templates`
- 运营端：`http://127.0.0.1:8780/ops-console/#/knowledge`

## 在线访问与发布

在线演示：[数据智能分析工具 Demo](https://zzzel.github.io/Data-Intelligence-Analysis/)，默认进入用户端。

GitHub Pages 从 `main` 分支的仓库根目录发布。将更新推送到 `main` 后，线上演示会自动更新；发布完成可能需要几分钟。

## 检查

在项目根目录执行：

```bash
npm test
```

该命令会依次检查两个子应用的语法、静态资源、关键演示流程、运营管理闭环以及跨端导航。

## 演示边界

- 两个端均为纯静态交互 Demo，仅使用本地 Mock 数据；
- 不连接真实模型、知识库、企业数据库、Web Search、Skill、Tool 或 MCP 服务；
- 页面中的能力调用、进度、文件处理和结果均为演示模拟；
- 当前仅定义桌面端产品形态，不包含移动端。
