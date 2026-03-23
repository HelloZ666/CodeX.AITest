# 智测平台（当前实际行为）

本仓库为前后端一体项目，前端基于 React + Vite，后端基于 FastAPI。文档只记录当前代码中的实际菜单、路由、接口、依赖、环境变量、启动方式和注意事项。

## 1. 技术栈与依赖

### 前端

- React 19.2
- TypeScript 5.9
- Vite 7.3
- Ant Design 6.3
- React Router 7.13
- TanStack React Query 5.90
- Axios 1.13
- ECharts 6.0
- Google Fonts（`Fira Sans`、`Fira Code`，通过 CSS `@import` 引入，网络不可达时回退到本地中文字体）

### 后端

- FastAPI
- Uvicorn
- Pydantic 2
- OpenAI SDK
- python-multipart
- openpyxl / xlrd / xlwt
- python-docx / olefile
- javalang
- loguru

## 2. 目录结构

```text
.
├─ api/                     # FastAPI 后端
├─ public/                  # 静态资源
├─ sample_files/            # 示例文件
├─ src/                     # React 前端
├─ .env.example             # 环境变量示例
├─ package.json             # 前端依赖与脚本
├─ requirements.txt         # 后端依赖
└─ start-dev.bat            # 本地一键启动脚本
```

## 3. 启动方式

### 环境要求

- Node.js 20 及以上
- Python 3.11 及以上
- Windows PowerShell / CMD（仓库内提供 `start-dev.bat`）

### 安装依赖

```bash
npm install
pip install -r requirements.txt
```

### 配置环境变量

```bash
copy .env.example .env
```

然后按需填写 `.env`。

### 一键启动

```bash
start-dev.bat
```

该脚本会：

- 启动后端：`http://127.0.0.1:8000`
- 启动前端：`http://127.0.0.1:5173`
- 后端健康检查：`http://127.0.0.1:8000/api/health`

### 仅检查环境

```bash
start-dev.bat --check
```

### 分别启动

后端：

```bash
cd api
python -m uvicorn index:app --reload --host 127.0.0.1 --port 8000
```

前端：

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

## 4. 环境变量

### 后端 `.env`

| 变量名 | 是否必填 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | AI 分析调用所需密钥 |
| `SESSION_SECRET` | 是 | 会话签名密钥 |
| `INITIAL_ADMIN_USERNAME` | 是 | 首次初始化管理员账号 |
| `INITIAL_ADMIN_PASSWORD` | 是 | 首次初始化管理员密码 |
| `INITIAL_ADMIN_DISPLAY_NAME` | 否 | 首次初始化管理员显示名 |
| `DB_PATH` | 否 | SQLite 数据库文件路径；未设置时默认使用 `api/data/codetestguard.db` |
| `CORS_ALLOW_ORIGINS` | 否 | 允许的跨域来源，逗号分隔 |
| `SESSION_COOKIE_SECURE` | 否 | Cookie 是否仅限 HTTPS |
| `SESSION_COOKIE_SAMESITE` | 否 | Cookie SameSite 策略 |

### 前端环境变量

| 变量名 | 是否必填 | 说明 |
| --- | --- | --- |
| `VITE_API_URL` | 否 | 前端 API 基础地址；未设置时默认使用 `/api` |

## 5. 菜单与导航

### 一级菜单

普通用户可见 7 组菜单，管理员可见 8 组菜单：

1. 数据看板
2. 功能测试
3. 自动化测试
4. 性能测试
5. AI辅助工具
6. 项目管理
7. 配置管理
8. 系统管理（仅管理员可见）

### 菜单结构与当前行为

| 一级菜单 | 二级菜单 | 路由 / 行为 |
| --- | --- | --- |
| 数据看板 | 生产问题分析 | `/issue-analysis` |
| 数据看板 | 测试问题分析 | `/defect-analysis` |
| 功能测试 | 案例生成 | `/` |
| 功能测试 | 案例质检 | `/functional-testing/case-quality` |
| 功能测试 | 分析记录 | `/functional-testing/records` |
| 自动化测试 | UI自动化 | 仅提示“敬请期待”，不跳转 |
| 自动化测试 | 接口自动化 | 仅提示“敬请期待”，不跳转 |
| 性能测试 | 压测 | 仅提示“敬请期待”，不跳转 |
| 性能测试 | 脚本生成 | 仅提示“敬请期待”，不跳转 |
| 性能测试 | 脚本执行 | 仅提示“敬请期待”，不跳转 |
| 性能测试 | 调优 | 仅提示“敬请期待”，不跳转 |
| AI辅助工具 | PDF校对 | 仅提示“敬请期待”，不跳转 |
| AI辅助工具 | 数据生成 | 仅提示“敬请期待”，不跳转 |
| AI辅助工具 | 回归验证 | 仅提示“敬请期待”，不跳转 |
| AI辅助工具 | 端到端测试 | 仅提示“敬请期待”，不跳转 |
| 项目管理 | 项目列表 | `/project-management` |
| 配置管理 | 生产问题 | `/production-issues` |
| 配置管理 | 测试问题 | `/test-issues` |
| 配置管理 | 需求映射关系 | `/requirement-mappings` |
| 配置管理 | 代码映射关系 | `/projects` |
| 系统管理 | 用户管理 | `/users` |

### 侧边栏当前行为

- 侧边栏固定在页面左侧并占满视口高度。
- 同一时间只保留一个一级菜单展开。
- 占位菜单统一弹出“敬请期待”，不创建新页面、不切换路由。
- 侧边栏菜单区域仅保留纵向滚动，不显示横向滚动条。
- 侧边栏收起后，选中态仅保留图标背景高亮，不显示左侧竖向指示条。

## 6. 路由清单

### 受保护路由

| 路由 | 页面 |
| --- | --- |
| `/` | 案例生成 |
| `/functional-testing/case-quality` | 案例质检 |
| `/functional-testing/records` | 案例质检记录列表 |
| `/functional-testing/records/:id` | 案例质检记录详情 |
| `/issue-analysis` | 生产问题分析 |
| `/defect-analysis` | 测试问题分析 |
| `/requirement-analysis` | 需求分析工作台 |
| `/requirement-analysis/history` | 需求分析历史 |
| `/project-management` | 项目管理 |
| `/production-issues` | 生产问题文件管理 |
| `/test-issues` | 测试问题文件管理 |
| `/requirement-mappings` | 需求映射关系维护 |
| `/projects` | 代码映射关系维护 |
| `/project/:id` | 项目详情 |
| `/history` | 历史记录兼容页 |
| `/users` | 用户管理（仅管理员） |

### 公开路由

| 路由 | 页面 |
| --- | --- |
| `/login` | 登录页 |

### 路由规则

- 未登录用户访问受保护页面会被拦截。
- 已登录用户访问 `/login` 会被重定向。
- `/users` 仅管理员可访问。
- 未匹配到的路由统一重定向到 `/`。

## 7. 主要页面说明

### 数据看板页

路径：`/issue-analysis`、`/defect-analysis`

当前两个数据看板页共用一套浅雾玻璃看板布局：

- 顶部仍为双栏 Hero：左侧展示主标题、当前项目/文件胶囊和 3 个焦点统计卡，右侧展示环形聚焦舱与 4 项关键状态。
- `/issue-analysis` 已同步收敛为与 `/defect-analysis` 一致的首屏数据布局，但不显示项目选择器；页面会默认加载最近上传的生产问题文件，且不再显示“数据来源文件”模块、“运行侧舱”和独立“本次结论”卡。
- `/issue-analysis` 的首屏当前改为“标题/文件胶囊/核心指标矩阵 + 右侧质量热区”结构，虽然没有项目选择器，但右侧热区会预留顶部对齐带以和左侧概览矩阵保持同一水平基线；热区底部摘要卡展示“高频阶段 / 高频标签”，其后依次展示“数据图谱”“关键归纳与治理动作”“导入明细列表”。
- `/defect-analysis` 已将项目选择器移动到 Hero 右上角，并在切换项目后自动加载该项目最近上传的测试问题文件；页面不再显示“数据来源文件”模块，也不再单独展示“本次结论”文字卡。
- `/defect-analysis` 的首屏已进一步收敛为直接数据展示：Hero 不再显示眉标说明、长段说明文案、文件绑定说明卡、右侧重复的项目/文件信息卡和底部提示文案；质量热区底部摘要卡当前展示“高频严重度 / 高频来源”及对应占比说明，不再展示“来源分类 / 原因分类”。
- `/defect-analysis` 已将原本独立位于首屏下方的 4 张核心指标卡整合进 Hero 左侧主区域，形成“标题/胶囊/高频卡/核心指标矩阵”的一体布局；其后依次展示“数据图谱”“关键归纳与治理动作”“导入明细列表”。
- `/defect-analysis` 的项目选择器当前位于 Hero 右上区域，并与下方“质量热区”按上下两行排布；标题与项目/文件胶囊整体上移，左侧核心指标矩阵与右侧质量热区在纵向上保持更接近的同一基线。
- `/defect-analysis` 的质量热区当前在桌面端改为“左侧环图 + 右侧纵向摘要卡”的紧凑布局，并与左侧概览矩阵使用同一高度基准，首屏两块核心模块保持明确等高。
- `/issue-analysis` 的环形聚焦舱展示“人为因素占比”；`/defect-analysis` 的环形聚焦舱展示“Top 严重度占比”。
- 两个页面的导入明细区仍按实际导入字段动态生成列，并保留分页与横向滚动。
- 当导入明细中的问题描述、摘要、原因、改善举措、影响或总结类字段过长时，表格单元格当前默认按两行截断并通过悬停展示全文，以避免单行记录高度过高；表头在页面向下滚动查看明细时保持 sticky 固定。
- 当前数据看板采用浅雾灰玻璃色板，强调色收敛为低饱和银蓝，用于减轻长时间查看时的视觉疲劳。

### 案例质检页

路径：`/functional-testing/case-quality`

当前页面为“顶部步骤条 + 下方操作区”的四步工作流：

1. 选择项目并检查代码映射状态
2. 上传需求文件并执行需求分析
3. 上传代码变更与测试用例并执行案例分析
4. 展示综合报告摘要与分析结果

当前行为：

- 顶部固定显示 4 个横向步骤卡，只保留步骤编号与步骤名称；步骤之间通过向右箭头串联。
- 第 1 步默认可用，第 2-4 步按“已选项目 / 需求分析完成 / 综合记录保存成功”逐步解锁；步骤状态通过颜色、边框和图标区分，不再显示“已完成 / 当前步骤 / 待解锁”等状态文字。
- 选择项目后自动切到第 2 步，需求分析成功后自动切到第 3 步，综合记录保存成功后自动切到第 4 步；已解锁步骤支持点击回看。
- 下方一次只展示当前步骤的具体操作区，不再并列展示 4 张大卡片。
- 第 2 步与第 3 步已收起标题下方说明文案，不再显示“执行条件”信息条和按钮下方状态提示，只保留上传区、主操作按钮、必要告警与结果卡片。
- 第 2 步与第 3 步上传卡片中的说明文案当前已收进标题后的浅白色 `说明` 按钮，鼠标移入按钮后显示对应格式和模板提示。
- 第 2 步和第 3 步的上传区采用“单卡状态切换”：未上传时显示拖拽上传卡，上传成功后原位切换为紧凑文件卡，并提供 `重新上传`、`移除` 操作，不再在卡片下方追加第二块文件摘要区域。
- 第 3 步的测试用例上传同时兼容两种模板：旧简化模板（`测试用例ID / 测试功能 / 测试步骤 / 预期结果`）和真实 Excel 模板（首行说明、第二行表头；至少识别 `用例编号 / 用例描述 / 测试步骤 / 预期结果`，并额外读取 `流程名称 / 功能模块路径 / 预置条件 / 检查点类型 / 测试类型 / 用例等级 / 用例类型 / 用例优先级`）。
- 第 1-3 步的操作区右侧固定显示“本月统计”占位面板，包含 `质检项目数`、`已分析用例`、`平均案例得分`、`报告生成数` 四项前端 mock 数据；前 3 步主操作区与统计面板按同一容器等高拉伸，第 4 步不显示统计面板。
- 分析成功后会尝试创建综合记录。
- 若综合记录保存失败，页面保留分析结果并提供重试保存。
- 案例分析的覆盖匹配当前采用多字段加权规则：优先用 `用例描述`，再联合 `测试步骤 / 预期结果 / 流程名称 / 功能模块路径` 判断映射描述是否被覆盖；评分侧继续看覆盖率、步骤完整性、预期明确性和边界用例，其中 `预置条件`、`用例类型=反向`、`用例描述含特殊数据` 会影响评分。
- 第 4 步汇总报告顶部只保留一组汇总指标卡和覆盖率环图，不再在下方详情区重复展示同一组概览；当前第一行是 `案例得分 / 案例数 / 映射命中数`，第二行是 `改动方法 / 已覆盖 / 未覆盖`。历史详情页顶部仍以“综合记录概览”卡片展示同一组指标，不再展示总 Token 与总成本。
- 汇总报告中的需求分析区标题不再显示“去 AI”相关字样；需求分析区仍隐藏 AI 明细、需求评分卡和逐条命中明细，只保留“需求映射建议”。摘要卡片当前只展示“命中关键词 / 建议补齐场景”两个紧凑信息面板，不再展示需求点编号、章节标签、命中数量标签和底部“测试范围建议”提示块。

### 需求分析工作台

路径：`/requirement-analysis`

当前行为：

- 页面维持四步工作台：项目选择、文件上传、智能解析、生成报告。
- 文件上传步骤不再直接展示长说明文字，当前改为跟随“需求文档”标题同行的浅白色 `上传说明` 按钮；鼠标移入按钮后显示 Word 文档格式提示。

### 案例质检记录页

路径：`/functional-testing/records`

当前行为：

- 列表支持按项目筛选，并在右侧固定显示 `详情` 操作列。
- 固定操作列悬停时保持实体背景，`详情` 按钮不再上浮，避免与底层表格内容重叠。

### 配置管理页

当前支持：

- 生产问题文件上传与分析
- 测试问题文件上传与分析
- 需求映射关系上传与维护
- 代码映射文件上传、增删改查

## 8. API 清单

前端默认通过 `/api` 访问后端；如设置 `VITE_API_URL`，则使用自定义基础地址。

### 健康检查

- `GET /health`

### 认证与用户

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /users`
- `POST /users`
- `PUT /users/{user_id}`
- `PUT /users/{user_id}/status`
- `PUT /users/{user_id}/password`

### 通用分析与上传

- `POST /analyze`
- `POST /upload/validate`

### 生产 / 测试问题分析

- `POST /issue-analysis/import`
- `POST /defect-analysis/import`
- `GET /production-issue-files`
- `POST /production-issue-files`
- `GET /production-issue-files/{file_id}/analysis`
- `GET /test-issue-files`
- `POST /test-issue-files`
- `GET /test-issue-files/{file_id}/analysis`

### 需求分析

- `POST /requirement-analysis/analyze`
- `GET /requirement-analysis/records`
- `GET /requirement-analysis/records/{record_id}`
- `GET /requirement-analysis/rules`
- `POST /requirement-analysis/rules`
- `PUT /requirement-analysis/rules/{rule_id}`
- `DELETE /requirement-analysis/rules/{rule_id}`

### 项目与代码映射

- `GET /projects`
- `POST /projects`
- `GET /projects/{project_id}`
- `PUT /projects/{project_id}`
- `DELETE /projects/{project_id}`
- `POST /projects/{project_id}/mapping`
- `POST /projects/{project_id}/mapping/entries`
- `PUT /projects/{project_id}/mapping/entries`
- `DELETE /projects/{project_id}/mapping/entries`
- `GET /project-mapping-template`

### 需求映射

- `GET /projects/{project_id}/requirement-mapping`
- `POST /projects/{project_id}/requirement-mapping`
- `PUT /projects/{project_id}/requirement-mapping`
- `GET /requirement-mapping-template`

### 项目维度分析与记录

- `POST /projects/{project_id}/analyze`
- `GET /records`
- `GET /records/{record_id}`
- `GET /records/{record_id}`（前端当前也用于导出 JSON Blob）

`POST /projects/{project_id}/analyze` 当前行为：

- `code_changes` 仅支持 `.json`，需包含 `current / history`，每个元素支持完整字符串或逐行数组。
- `test_cases_file` 支持 `.csv / .xlsx / .xls`，兼容旧四列表头模板与真实 Excel 模板。
- 覆盖分析按项目代码映射描述与测试用例多字段文本做匹配，不依赖单一 `测试功能` 列。

### 案例质检综合记录

- `POST /case-quality/records`
- `GET /case-quality/records`
- `GET /case-quality/records/{record_id}`

### 兼容保留接口

- `GET /mapping`
- `GET /mapping/latest`
- `GET /mapping/{mapping_id}`
- `POST /mapping`
- `DELETE /mapping/{mapping_id}`

## 9. 前端 API 封装

主要封装位于 `src/utils/api.ts`，当前包含以下能力：

- 鉴权与用户管理
- 文件校验与通用分析
- 生产 / 测试问题分析
- 需求分析记录与规则维护
- 项目、代码映射、需求映射维护
- 项目维度分析记录
- 案例质检综合记录
- 兼容保留的全局映射接口

## 10. 当前注意事项

- 界面文案以中文为主。
- 数据看板页会优先加载 `Fira Sans` / `Fira Code` 远程字体；若网络不可达，会自动回退到本地中文字体，不影响功能使用。
- `/history` 与 `/requirement-analysis/history` 仍保留兼容访问，但不在菜单中暴露。
- 占位菜单统一只提示“敬请期待”，不会跳转到新页面。
- `/users` 页面受管理员权限保护。
- 侧边栏菜单区已移除横向滚动条，仅保留纵向滚动。
- 如代码继续发生功能变更，必须同步更新本 README。

## 11. 界面可读性补充

- `/functional-testing/case-quality` 当前已上调顶部流程步骤卡片、当前步骤操作卡片、项目选择框、状态标签和项目下拉选项的字号，优先解决项目名与步骤文案过小的问题。
- `/requirement-analysis` 与 `/`（案例生成）共用的 `glass-workbench` 选择器、步骤卡片标题、说明文案和提示信息已同步放大，保持三个工作台页面的字号表现一致。

---

最后更新：2026-03-23
