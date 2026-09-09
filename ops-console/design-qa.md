# Design QA — 通用页头与 RAG 入库

## 2026-09-09 文件目录更新

**证据**

- Source visual truth: `/var/folders/kq/5wc9n16j51b2gnvghhdr_wqw0000gn/T/TemporaryItems/NSIRD_screencaptureui_YLMICZ/截屏2026-09-09 17.13.59.png`
- Source evidence copy: `qa/directory-tree-reference.png`
- Implementation screenshot path / reproducible comparison surface: `qa/directory-tree-comparison.html`
- Implementation URL: `http://127.0.0.1:8780/demo/ops-console/#/local-documents`
- Comparison URL: `http://127.0.0.1:8780/demo/ops-console/qa/directory-tree-comparison.html`
- Source pixels: `564 × 676`; normalized at `@2x` to `282 × 338 CSS px`.
- Implementation focused clip: `250 × 338 CSS px`; source and implementation were rendered together in the comparison surface and captured by the Codex in-app browser at `1280 × 720`, DPR 1.
- Full-view browser evidence: document management and knowledge import at `1838 × 1354`, DPR 1. Minimum supported desktop width also checked at `1024 × 900`; the product shell intentionally has a `1024px` minimum width.
- State: light theme; document root selected; local folders expanded; local/enterprise knowledge-import tabs; enterprise business folder selected; local upload target folder selected.

**Full-View Comparison**

- Document management uses a `250px` left tree and an unframed right table. Folder selection changes the URL and limits the right table to descendants while the tree retains the complete hierarchy.
- Knowledge import reuses the local document tree for “文档管理”. “企业数据” renders a separate connection → business-folder → file hierarchy using the same visual component.
- At `1024px`, the page has no document-level horizontal overflow or top-bar overlap; the wide data table scrolls inside its own table wrapper.

**Focused Comparison**

- Typography: both surfaces use compact sans-serif labels with regular file names and stronger folder names. The implementation is intentionally denser to match the existing operations console; letter spacing remains `0` and long names truncate with native title text.
- Spacing and layout: chevrons, folder icons, names, and right-aligned counts form stable tracks. Nested guide lines and `13px` depth increments make parent-child relationships legible. The selected row uses the reference's white raised treatment.
- Colors and tokens: neutral gray sidebar, dark labels, muted counts, thin separators, and blue active affordances map to existing product tokens. No decorative gradients or unsupported palette were introduced.
- Image and icon fidelity: the supplied screenshot is preserved at native resolution and normalized only for comparison. Product icons use the existing Lucide library; files intentionally have no icon per the requirement.
- Copy/content: directory labels are business-specific and counts match descendants. Upload mode explicitly states the destination folder. Move help text clarifies that knowledge-base references are unaffected.

**Interaction Evidence**

- Collapsing `供应链管理` changed `aria-expanded` to `false`, hid all 10 descendant file rows, and preserved the root count at 18.
- Selecting `业务数据与培训` produced `#/local-documents?folder=FOLDER-SCM-DATA` and exactly `SCM-DOC-08/09/10` in the right table.
- The create-folder dialog exposes name and hierarchical parent selection. The move dialog exposes all valid folders and preserves knowledge-base references.
- Knowledge import local mode rendered 18 local assets. Enterprise mode rendered three independent connection/business directory branches and three source files; selecting one business folder reduced the table to one file.
- Selecting an enterprise file enabled `下一步（1）`; switching to upload displayed `上传后存入：未分类`.
- Uploading from `FOLDER-SCM-DATA` routed to `#/local-documents/upload?step=upload&folder=FOLDER-SCM-DATA` and displayed `上传后存入：业务数据与培训`.
- Browser console warnings/errors: none.

**Comparison History**

1. Initial pass found a P1 layout defect in knowledge import: `[hidden]` on the inactive enterprise directory was overridden by the sidebar's `display:flex`, so the right file table wrapped below the local tree and the first viewport appeared blank.
2. Fix: added `.document-directory-sidebar[hidden] { display: none; }` and reloaded the same route/state.
3. Post-fix evidence: local tree and file table rendered side by side at `250px / minmax(0, 1fr)`; enterprise switching produced the same layout with independent data. No remaining P0/P1/P2 issue was visible in the combined normalized comparison.

**Follow-up Polish**

- P3 accepted deviation: the reference uses filled, heterogeneous icons and larger row spacing. The implementation keeps the product's Lucide stroke icons and denser operations-console rhythm; file icons are deliberately omitted.

final result: passed

本文件只验收知识 / RAG 与部分配置运营专项原型，不代表完整运营端范围；未覆盖的运行管理、版本/批次、真实企业数据导入、模型路由与 Prompt/策略仍以正式 PRD 和需求清单为准。

## 本轮验收范围

- `PageHeader` 单行通用契约：页面身份与搜索、筛选、视图、主要操作在同一行分区承载
- `page-content` 开放内容区：移除检索测试等页面无意义的最外层线框
- 四步建库：定义知识库、导入文件、文档解析策略、文档处理策略
- 向量模型来源、维度联动及知识库创建后的不可切换约束
- 多文件选择/拖放、逐文件状态行和删除操作
- 知识库列表的可点击名称、测试/详情/编辑/删除闭环，以及不可检索时测试入口的禁用态
- 知识库紧凑完整的两行信息区、单一文件生命周期、切片数列和可点击文件名称
- 源文档与切片卡片并排的通用预览，文件切换/下载、真实切片数、卡片展开收起、新增切片及重新向量化 Token 影响提示
- 重名同内容跳过、同名不同内容明确更新原文档或另存、更新成功后同步引用库的导入闭环
- MinerU 解析配置是否真正服务 RAG，且不与切片策略重复
- 模型管理的 LLM／向量／Rerank 三分区列表、弹窗 CRUD、API Key 脱敏、手动/保存自动测试和删除引用保护
- 企业数据的三类数据库接入、用户名/密码、测试后加载可访问数据库、目标数据库选择、明文不落状态，以及不提前选择 Schema/表/视图的边界
- 全局 Query 检索设置的系统固定项、运营可配项、直接生效边界与 Rerank 模型引用保护
- 检索测试从知识库详情与检索配置进入，只选知识库，可临时试用未保存设置，去除冗余文案、展示运营评估并在输入框内触发检索
- Skill、Tool 与可视化管理在运营端完整下线，历史深链安全回退
- API 密钥的知识库范围、检索策略、一次展示、精简列表与删除闭环

不验收真实数据库、后端文件持久化或真实 MinerU/RAG 请求。Skill、Tool 与可视化生成由底层系统预置；报告由用户端 AI 根据任务、证据和交付目标自由组织，不设置模板或固定章节。运营端只验收这些底层能力及报告模板配置相关的导航、路由、页面、状态和管理动作均不存在。产品不存在移动端，因此移动端布局、导航与触控交互均不属于设计或验收范围。

## 视觉与结构依据

- 整体视觉参考：`design/reference-option-1.png`
- 实现验收视口：1440 × 900 与 1024 × 768，DPR 1
- 桌面运营端原则：白色开放画布、薄分隔、低装饰、台账式信息密度
- 页面只允许一个 H1；Panel 必须表达真实分组，不能只是整页套框

## 组件验收

### PageHeader

| 检查项 | 通过标准 |
|---|---|
| 页面身份 | 返回图标和 H1 位于左侧，返回图标具有可访问名称；不显示重复路径导航 |
| 右侧操作 | 搜索、筛选、视图切换和主要操作位于同一行右侧；页面不输出第二行 toolbar |
| 复用 | 知识库、模型等目录不再各自拼装独立 FilterBar |
| 桌面排版 | 1440 下单行稳定对齐；1024 下控件允许收缩，标题和主要动作保持可见且不产生第二行 |

### 开放内容区

- 检索测试直接呈现左右工作区，不在外层再套 Panel。
- 抽屉内部、信息块和单张表格仍可使用 Panel，因为这些边框有明确分组语义。

## 四步建库验收

所有真实必填字段都使用统一红色星号，且对应控件同时带有 `required` 和 `aria-required="true"`；可选字段不得显示星号。

### 1. 定义知识库

- 名称、描述、向量模型/向量维度纵向排列。
- 仅向量模型和维度组成同一行的两列结构；维度为跟随模型的只读值。
- 模型选择来自模型管理中已经通过连通性测试的向量模型。
- 明确提示绑定后不可切换；动作层把模型 ID 和维度固化到知识库。
- 按钮分别为“取消”“仅创建”“创建并导入”：取消不创建，仅创建进入详情，创建并导入进入第 2 步。

### 2. 导入文件

- 支持文件选择器多选和拖放；不重复显示知识库名称、ID、模型、等级等上一步摘要。
- 每个文件一行，依次显示格式图标、名称/大小、准备或上传中状态、删除按钮。
- 文件上传中禁止删除；没有文件时“导入”不可用。
- 底部只有“取消”和“导入”。四步创建中的导入动作只暂存文件，策略完成前不开始解析。
- 同库再次导入重名文件时比较内容指纹：同内容显示“内容相同，已跳过”，不创建对象；不同内容进入原文件替换确认，确认前原文件保持可检索，确认后沿用原 `doc_id` 并提示重新生成向量及 Embedding Token 消耗。

### 3. 文档解析策略

面向 RAG 的验收目标是：保留阅读顺序、文本/表格/公式/图片语义、块级结构及原文定位。界面应包含：

- 解析模式不提供人工选择；系统根据视觉理解开关双向派生 MinerU `effort`：关闭为 `medium`，开启为 `high`。
- 文字提取：默认 `auto`，优先读取原生文字，扫描型、图片型 PDF 或文字层异常时自动 OCR；也可显式选择 `txt / ocr`。
- 文本内容与版面结构固定开启并以“必选”状态呈现；结构化内容列表及页/块定位归入版面结构，不提供单独关闭入口。
- 表格解析和公式解析分别可选；图片 / 图表内容理解合并为一个选项且默认关闭，开启后自动使用精细解析并启用 VLM Image Analysis。
- 原图由系统固定保存，不展示“附加输出”分组或开关，且与 VLM 开关互不影响。
- 默认本地解析；本 Demo 不提供 endpoint 或远程上传开关。
- 从文档管理上传进入的第 2 个可见步骤必须直接复用本步的全部字段、默认值和联动，只将步骤条收口为“上传 → 解析”，主按钮改为“开始解析”。提交后立即返回文档列表；不显示独立解析完成卡、逐文件状态行、动效、重试/完成按钮或解析结果预览。

本步骤不得出现切片长度、重叠比例或分隔符配置。官方能力依据见 `design-spec.md` 的“RAG 文档入库配置边界”。

### 4. 文档处理策略

- 文档处理没有独立导航或管理页；自动、语义、结构／规则、固定长度、按页和整篇六类方案由代码预置。进入知识库创建/文件导入第 4 步时默认选中“自动切片”，并立即显示其可编辑参数。六张策略卡按稳定顺序放在同一网格，按页与整篇不再折叠或归入“更多策略”。历史 `ING-02` 只保留读取兼容，不出现在新选择界面。
- 策略卡只显示名称、描述和推荐 Tag，不重复“最大字符 / 重叠 / 索引内容”摘要。
- 选中策略后，下方编辑区按方式展示全部有效参数：自动/固定长度使用最大字符和重叠；语义使用最大字符和低/均衡/高三档切分敏感度；结构／规则使用一个包含九个常用边界的下拉，每项同时显示 token 与中文含义：“结构边界”、`\n\n`、`\n`、`。`、`！`、`？`、`.`、`!`、`?`；值依次为 `structure|paragraph|newline|zh_period|zh_exclamation|zh_question|en_period|en_exclamation|en_question`，不展示合并 `sentence`、自定义符号选项或输入框，历史 `sentence` / `custom` / `literal` 值仅在动作层兼容；按页使用每片页数；整篇选择超长文档处理方式，不显示无效的重叠输入。自动切片只组合结构边界、递归拆分与长度兜底，不得静默启用语义切片。语义参数附近只放一句轻提示：效果需用真实问题集验证，入库会增加句段 Embedding 消耗与处理耗时，查询阶段不额外增加；不设标题、影响卡片组或未实测的准确率承诺。
- 策略卡布局参考文档解析的响应式密度：六张卡始终共用一个网格，可用宽度充足时优先三列，紧凑桌面切换为两列，不添加单独的更多策略外框或冗余嵌套说明。
- “关联信息”保留文件名、标题路径、页码等元数据，服务过滤、定位和引用；“索引内容”选择正文、表格文本和图片 OCR 等真正参与检索的文本，两者不混为一组开关。
- 不提供共享方案的新建、编辑、复制、查看、试切片、启停、状态或“应用到知识库”动作；运营人员只能在知识库创建和后续文件导入流程中选择预置并编辑本次参数。
- 本次参数固化到知识库/导入批次快照，不改写代码中的共享预置。
- 文档处理策略只负责切片和索引规则，不绑定或筛选向量模型；向量模型已在第 1 步独立固化。
- 默认 Step 3 的图片 / 图表内容理解关闭并派生 `medium`；开启后派生 `high`。识别内容宽屏优先三列，空间不足时两列。解析产物缺项只影响本次可进入索引的内容完整度，不把已启用策略整卡禁用；动作层应返回具体缺项，供完成前提示运营人员。
- 可见界面不展示策略 ID、revision、草稿/历史、模型绑定、MinerU 或 OpenSearch。
- 完成后，暂存批次才进入解析、切片、向量化和索引流程。

## 知识库详情与切片预览验收

- 详情 PageHeader 只显示返回和知识库名称，不再重复 ID 或描述副标题；列表中的知识库名称可点击并进入同一详情地址。
- 常驻信息区保持紧凑但不得删减知识库自身信息：第一行为两列基础信息，必须包含 ID、描述、向量模型、启停状态与时间；不显示全局 Query 检索设置、Rerank 模型、文件总数或所谓“文档处理策略”。
- 第二行整行展示“知识处理与检索状态”链；处理中或错误可显示真实进度，不伪造警告。
- 文件列表只有“文件 / 文件状态 / 切片数 / 导入时间 / 操作”等必要列；不显示当前修订、文件等级、页数或另一套检索状态。
- 文件状态是唯一权威生命周期：解析中、切片中、向量化中、索引中、可检索、处理失败。尚未启动处理的上传项不提前创建文件对象；进度中可带阶段/百分比，但不再并排“处理状态 / 检索状态”。
- 文件名称本身可点击打开详情，操作仍至少包含“详情 / 删除”；处理失败可显示“重试”。删除确认必须说明会移除该文件的切片、向量和引用，不宣称会产生新 Token 计费。
- “预览”打开通用双栏组件：顶部可切换当前知识库文件并下载原文件，不显示文件处理状态；左侧直接显示源文档内容，不再增加独立“源文档”栏头。
- 从文档管理进入详情时，左侧始终展示当前原文件，右侧常驻“查看切片”选择器；无引用时显示禁用的“暂无知识库引用”，存在引用时只包含实际引用知识库并展示所选库切片。选择器下不重复展示知识库名称或状态列表，也不提供公共池处理结果。文档管理没有“加入知识库”操作，引用只能从知识库管理建立。预览工作区填满页头以下的剩余高度，内容在各自栏内滚动。
- 右侧标题严格显示“全部切片（N）”，N 等于当前 DOM 中真实渲染的切片卡片数量；不出现“代表切片”“当前展示 X / Y”等汇总。
- 切片卡片默认截断，点击一张后展开全文并设置 `aria-expanded="true"`；再次点击该卡片或点击卡片列表外区域后收起。展开另一张时上一张同步收起。
- “新增切片”要求内容必填；保存前明确提示“重新生成向量”和“Embedding Token 消耗”，保存后文件进入向量化/索引中，新卡片立即出现。
- 页面不出现“导入记录”页签，`tab=imports` 兼容地回到文件内容，不恢复历史台账。
- 同名同内容跳过时不增加文件/切片/Token 记录；同名不同内容由用户明确更新原文档或另存。更新时沿用稳定文档 ID，记录向量重建、索引更新和 Token 消耗影响，成功后同步所有引用库；产品只展示当前内容。

## 模型管理验收

- LLM、向量模型与 Rerank 模型在上下三个独立表格板块中展示；PageHeader 只保留搜索和“新增模型”，不再用类型或状态筛选。
- 三表复用相同的四列网格；LLM 表第二列展示总参数与激活参数，向量表第二列展示向量维度，Rerank 表保留同宽空单元格但不显示标题或数值，使连接状态和操作严格对齐。
- 原“状态”与“最近测试”合并为“连接状态”：主行显示连接正常、连接失败或待测试，辅助行显示测试时间。
- 页面不出现模型 ID、版本、服务来源、引用配置、“查看引用”或说明性底部边界。
- “新增模型”与“编辑”复用同一弹窗表单；列表只提供测试、编辑和删除，不再提供内容重复的查看入口。
- 新增时使用三张卡片选择模型类型；通用表单包含名称、API 地址和 API Key。LLM 额外要求总参数不低于 25B；向量维度由连接结果读取并以只读字段展示；Rerank 的名称输入占满整行。不存在鉴权方式、请求超时或 Rerank 用途字段。
- 编辑时模型类型不可切换；API Key 输入框显示现有脱敏值，保持不变时沿用原密钥，清空则按必填项校验，页面和状态中都不保存明文 Key。
- “测试连接”与取消、保存同属底部操作区，用于检查当前未保存输入；修改任一字段后清除本次通过提示。
- 点击保存时必须再对当前 API 地址和 Key 自动测试；失败时弹窗不关闭且不创建/更新，通过后才落库并直接处于连接正常。
- 正在被默认回答生成引用的 LLM、被知识库绑定的向量模型、被全局 Query 检索设置选中的 Rerank 模型不能删除。无引用模型使用“取消 / 删除”确认弹窗后从目录移除。
- 连接正常的向量模型可在“定义知识库”选择；连接失败或待测试模型不进入可选来源。

## 企业数据接入验收

- 页面与侧栏统一命名“企业数据”，主操作和新建弹窗统一使用“接入数据库”；编辑态标题为“编辑数据库”。
- 页面不显示顶部接入说明条；点击数据库卡片标题与点击“编辑”必须进入同一个编辑弹窗，不存在独立详情页或详情抽屉。
- 弹窗顶部直接展示数据库名称与可选描述，不嵌套“数据库信息”卡片、标题或说明；下方保留“连接信息”模块，用三张图标与标题卡选择 PostgreSQL、MySQL、SQL Server，并包含服务器地址、端口、用户名、密码和目标数据库下拉。连接信息标题下不显示重复说明，类型下方也不重复出现“连接配置”小标题。
- 端口随类型带入默认值，SSL 默认开启且不显示开关。目标数据库下拉始终可见，未测试时为禁用态，不出现实际库名手工输入框。
- 填完类型、服务器地址、端口、用户名和密码后，点击“测试并获取数据库”；成功后加载当前账号可访问的 DB 列表并启用目标数据库下拉。只有选定一个目标数据库后才能确认接入；修改任一服务器级连接字段后，应清除本次测试结果与已加载列表并再次禁用下拉。
- 连接配置止于数据库级，不出现授权范围、Schema 下拉或表/视图复选框；这些对象留到后续导入流程选择。
- 密码使用密码输入框且不回显；编辑时留空沿用已保存密码。内存状态只保留用户名与 `passwordConfigured`，不得出现明文密码、脱敏密码内容或旧凭据引用字段。
- 页面使用“一张卡片代表一个数据库”的网格，不使用连接表格。卡片显示名称、描述、类型、已选择的目标数据库、服务器、连接状态、最近测试和操作；不提供启用状态，连接测试失败只更新为“连接失败”。

## 全局 Query 检索设置与测试验收

- `#/retrieval-config` 管理唯一的全局 Query 检索设置；不展示配置列表、版本、生效/草稿状态，不提供复制草稿、应用到知识库、发布或回滚操作。
- 系统固定使用混合召回，候选规模、去重和元数据过滤由代码派生；运营人员不能配置过程候选数。页面以包含关系展示混合检索及其关键词 / 语义两路能力。
- 运营可配项只包含关键词 / 语义融合权重（10%–90%，步长 5%，总和恒为 100%）、Rerank 开关与连接正常的模型、最终 Top K（5–20，默认 10）和最低相关度（0.40–0.90，步长 0.01，默认 0.60）。不存在单文件最大切片数。最低相关度复用 Top K 的紧凑数字输入，以两位小数显示；字段下方的单行说明同步展示当前值及宽松 0.40–0.50、均衡 0.51–0.70、严格 0.71–0.90 参考区间。
- 保存全局设置后立即对后续 Query 请求生效，不触发文档解析、切片、向量化或索引重建，也不改变知识库可用状态。
- 知识库详情页头与检索配置页头均提供快捷入口。从知识库进入时只带入知识库；从设置页进入时可携带当前未保存的表单作为临时测试设置，但不回写全局值。
- 测试页左侧仅保留知识库选择，不出现检索配置、版本或生效状态选择；右侧直接呈现问题输入、运营评估和证据结果，不显示无操作价值的设置说明、当前测试对象/配置摘要或完成状态等重复文案。
- “运行检索”按钮放在问题输入框内部的尾部操作位，不在输入框下方另建操作栏。
- 运营评估严格包含返回切片数、有效证据数、证据覆盖度和结果相关性四项；证据卡逐条展示本次实际用于排序和过滤的相关度，并标明来源为重排分或融合分；不展示 BM25、Dense、阶段耗时或总耗时等技术日志。
- 修改知识库选择更新 URL；运行检索刷新测试结果，但不保存或修改线上全局检索设置，也不修改知识库可用状态。
- 在 1024 视口下仍保持工作区可用，不出现水平裁切、浮层遮挡或输入区不可见。

## 底层能力边界验收

- 侧栏只保留知识库、数据接入、检索引擎、系统配置四个业务分组，不出现能力管理、Skill 目录或可视化能力。
- 运营端不加载能力页脚本，不注册 Skill、Tool、可视化页面或管理状态，也不暴露上传、编辑、启停、删除等动作。
- 历史 `#/tools`、`#/skills` 和 `#/visualizations` 深链统一回到 `#/knowledge`，不留下空白页。
- 用户端的运行过程仍可渲染 Skill、Tool 等调用节点，本次改造不修改 user-client。

## API 密钥验收

- 侧栏入口、路由标题、页头和操作文案统一使用“API 密钥”；现有 `#/api-access` 路径仅用于兼容已有链接。
- 页面仅管理检索 API Key，使用一张密钥表，不显示 API 能力类型选择、能力筛选或能力标签。
- “创建密钥”使用三步向导：第 1 步只填写必填名称并选择至少一个可访问知识库，第 2 步只配置检索策略，第 3 步生成并一次性展示完整 Key。第 2 步可返回且保留第 1 步内容；策略默认跟随全局，可切换为独立配置 Rerank、最终 Top K 与相关度阈值；不出现角色、权限等级、身份传递、IP 白名单、RPM 限额或到期日期。
- 创建成功后完整 Key 只展示一次，弹层的“完成”按钮默认禁用，成功复制后才可点击；关闭后只能看到脱敏值。
- 列表严格按名称、API Key、可访问知识库、检索策略、状态、最近使用时间、创建时间、操作排列；知识库列只显示数量，策略列只显示“全局 / 独立”，不在列表展开名称和参数详情，也不显示 API 能力、Client ID、凭证版本或权限等级；状态文案统一为“已启用 / 已禁用”。
- 查看弹窗使用不可编辑的静态文本展示名称与脱敏 Key；可访问知识库只列名称，不展示 ID 和检索状态；检索策略只展示 Rerank 模型、最终 Top K、相关度阈值。
- 操作严格为查看、启用或禁用、删除；查看弹窗复用创建弹窗的信息层级，在一页只读展示名称和脱敏 Key。删除代替“永久作废”，影响确认明确说明当前 Key 立即失效且记录从当前列表移除。
- 表格末尾不显示“共 N 个 API 密钥”数量 footer；空列表仍可使用空状态。
- 检索 API Key 不得复用或展示检索服务连接中的上游访问凭证。

## 自动与浏览器证据

自动检查：

```bash
node demo/ops-console/tests/api-access-check.mjs
node demo/ops-console/tests/static-check.mjs
node demo/ops-console/tests/closed-loop-check.mjs
```

- API 密钥检查独立覆盖知识库白名单、全局/独立检索策略、运行时配置解析、名称去重、一次性明文返回、启停删除及旧记录兼容，并反向拒绝能力类型选择、筛选、能力列和权限等级。
- 静态检查直接执行 `dom.pageHeader()` 并校验生成的单行 DOM、拒绝旧第二层工具栏；同时检查开放内容区、文档处理无独立导航/路由/管理动作且流程内编辑完整。反向断言运营端不包含 Skill、Tool、可视化或报告模板配置的导航、路由、页面、动作、状态和专用样式。
- 闭环检查验证真实状态变化：模型保存自动测试/API Key 脱敏/连接状态/引用删除保护、服务器连接测试/数据库列表加载/目标数据库必选/用户名密码校验/明文不落状态/无 Schema 授权、知识库模型固化且不绑定 Rerank、文件单一生命周期、切片数及新增切片后的向量化/Token 影响、同内容跳过、异内容更新与企业来源稳定键同步、解析配置、文档处理策略仅在知识库流程选择、全局 Query 检索设置的可配项校验/直接生效、全局及 Key 级 Rerank 引用保护，以及临时未保存设置只影响当次检索测试和 API 密钥管理。同时校验运营端状态与动作层不存在底层能力管理对象。

浏览器回归路径：

1. `#/knowledge` → 新建知识库 → 仅创建。
2. `#/knowledge` → 新建知识库 → 创建并导入 → 选择与拖入两种文件 → 删除一行 → 导入 → 配置解析 → 选择代码预置方案并编辑本次文档处理参数 → 完成；随后从已有知识库再次“导入文件”，确认完整经过上传、解析和可编辑文档处理三步，再分别验证同内容跳过、同名异内容更新确认/Token 提示、更新成功后的引用库同步，以及另存为同名新文档入口。
3. `#/models` → 检查向量/Rerank 两个表格板块 → 新增向量模型 → 手动测试当前输入 → 保存自动复测 → 快捷测试与编辑 → 再次进入建库确认成为选项 → 分别验证有引用删除阻断和无引用删除成功。
4. `#/enterprise-connections` → 核对页面无顶部说明条 → 分别点击数据库标题和“编辑”，确认均只出现同一个“编辑数据库”弹窗且无详情抽屉 → 接入数据库 → 核对名称与描述直接展示、下方仅“连接信息”保留模块边界且无说明文字 → 填写数据库名称与描述 → 切换三种数据库类型卡片并核对默认端口 → 填写服务器地址、用户名和密码，确认目标数据库下拉已显示但禁用 → 点击“测试并获取数据库” → 核对下拉启用且仅出现当前账号可访问的 DB → 选择目标数据库后确认接入；再次编辑确认密码不回显且留空可保存，修改服务器级字段后确认下拉重新禁用，再模拟失败复测并观察唯一连接状态。
5. `#/knowledge/KB-001` → 点击文件名称进入预览；切换文件、下载原文件、核对“全部切片（N）”与真实卡片数，依次验证卡片点击展开/再次点击/点击外部收起，再新增切片并确认向量化 Token 提示与状态更新。
6. `#/knowledge` → 点击知识库名称进入详情；分别点击可/不可检索知识库的“测试”，验证正常带入与禁用态；再验证详情、编辑和删除。
7. `#/retrieval-config` → 核对混合检索包含两路只读能力，调整融合权重时百分比与右侧卡片比例同步；切换 Rerank 时只显示或隐藏模型，更改 Top K/最低相关度并保存后确认全局生效；在最低相关度输入 0.71、0.72 等百分位数值并验证两位小数归一化、区间校验和行内说明同步，再修改未保存值进入检索测试，验证当次结果使用临时设置、输入框内检索按钮、四项运营评估和逐条相关度分数；返回设置页确认未保存值没有替换线上值。
8. 分别打开 `#/tools`、`#/skills` 和 `#/visualizations`，确认都回到知识库管理，且侧栏没有能力管理分组。
9. 打开 `../user-client/#/chat/copper-decision`，确认任务运行记录中的 Skill、Tool 调用节点仍正常展示。
10. `#/api-access`：确认导航与页头均为“API 密钥”，页面没有能力类型选择、筛选、能力列或权限等级；逐步检查“名称与知识库 → 检索策略 → 获取 API Key”，验证上一步保留草稿且生成前不创建记录，最后必须先复制一次性 Key 才能完成；检查列表字段顺序、无数量 footer、查看弹窗回显、已启用/已禁用状态，以及单条密钥的启停与删除。

浏览器验收记录必须包含页面身份、非空页面、无框架错误层、控制台健康、关键交互状态和 1440/1024 截图。自动检查通过不能替代此视觉/交互证据。
