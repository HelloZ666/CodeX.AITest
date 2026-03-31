# 智测平台

当前仓库是一个前后端一体化的测试工作台，前端基于 React + Vite，后端基于 FastAPI + SQLite。

当前实际已实现的能力包括：

- 质量看板：仅管理员可见的效能分析占位入口、质量分析（生产问题分析、测试问题分析）
- 功能测试：案例生成、案例质检、分析记录、记录详情
- 需求分析：需求文档解析、需求映射、过滤规则、历史记录
- 接口自动化：接口文档解析、用例生成、用例编辑、执行、报告、重跑
- AI 辅助工具：AI 助手问答，支持附件分析、多轮对话与上下文续聊
- 配置管理：生产问题、测试问题、提示词管理、需求映射关系、代码映射关系
- 系统管理：用户管理、操作记录
- AI 提供方：支持 `DeepSeek` 与“公司内部大模型”

文档仅描述当前代码中的实际行为，不保留失效流程或旧命名。

## 技术栈

### 前端

- React 19
- TypeScript 5
- Vite 7
- Ant Design 6
- React Router DOM 7
- TanStack React Query 5
- Axios 1
- ECharts 6
- file-saver
- Vitest / Testing Library

### 后端

- FastAPI
- Pydantic 2
- SQLite
- OpenAI SDK
- httpx
- python-multipart
- openpyxl / xlrd / xlwt
- python-docx / olefile
- PyMuPDF
- PyYAML
- loguru

## 目录结构

```text
.
├─ api/                  FastAPI 后端
├─ public/               前端静态资源
├─ sample_files/         示例文件
├─ src/                  React 前端
├─ .env.example          环境变量示例
├─ AGENTS.md             仓库协作说明
├─ build-package.ps1     发布打包脚本
├─ package.json          前端脚本与依赖
├─ README.md             当前说明文档
├─ requirements.txt      后端依赖
└─ start-dev.bat         开发启动脚本
```

运行时目录默认不放在仓库内。项目默认使用同级 `CodeX.AITest.runtime` 目录存放运行时数据，后端在直接执行 `python -m uvicorn index:app ...` 时也会自动读取该目录下的 `.env`；`start-dev.bat` 只是额外帮你先把环境变量注入到启动进程中。运行时目录存放：

- `.env`
- `data/codetestguard.db`
- `logs/backend.log`
- `logs/backend-console.log`
- `logs/frontend-console.log`

## 安装与启动

### 环境要求

- Node.js 20+
- Python 3.11+
- Windows PowerShell / CMD

### 安装依赖

```bash
npm install
pip install -r requirements.txt
```

### 准备环境变量

推荐复制到外部 runtime 目录：

```bash
copy .env.example ..\CodeX.AITest.runtime\.env
```

后端环境变量读取优先级如下：

1. 进程环境变量
2. 项目同级 `CodeX.AITest.runtime\\.env`
3. 项目根目录 `.env`

也就是说，部署到公司环境时即使不经过 `start-dev.bat`，只要后端进程能访问到项目同级 runtime 目录，AI 提供方、内部模型、数据库、日志、认证等配置也会自动生效。

### 一键启动

```bash
start-dev.bat
```

如需强制释放当前开发端口并重新拉起前后端，可执行：

```bash
start-dev.bat --restart
```

当前启动脚本行为：

- 直接执行 `start-dev.bat` 时，如果 `8000` 或 `5173` 端口已被旧进程占用，脚本会直接报错退出，并打印占用端口的 PID，避免“看起来重启成功、实际上仍在跑旧后端”
- 执行 `start-dev.bat --restart` 时，会先停止当前占用 `8000` / `5173` 的监听进程，再重新启动后端和前端
- 仅执行环境检查时，可使用 `start-dev.bat --check`

默认访问地址：

- 前端：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- 后端：[http://127.0.0.1:8000](http://127.0.0.1:8000)
- 健康检查：[http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

### 分别启动

后端：

```bash
cd api
python -m uvicorn index:app --host 0.0.0.0 --port 8000
```

前端：

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

### 打包发布

```powershell
powershell -ExecutionPolicy Bypass -File .\build-package.ps1
```

当前打包脚本会：

- 仅打包源码与必要配置
- 排除 `node_modules/`、`dist/`、`coverage/`、`.git/`、`__pycache__/`、`.pytest_cache/`
- 排除运行时数据库、日志和缓存文件
- 输出到 `release-packages/`

## 环境变量

### AI 相关

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `AI_PROVIDER` | 否 | AI 提供方，`deepseek` 或 `internal`，默认 `deepseek`；可放在进程环境变量、项目同级 runtime `.env` 或项目根 `.env` |
| `AI_PROVIDER_LABEL` | 否 | 前后端展示名称；未配置时 `deepseek -> DeepSeek`，`internal -> 公司内部大模型` |
| `AI_MODEL_NAME` | 否 | `deepseek` 模式下的模型名称，默认 `deepseek-chat` |
| `DEEPSEEK_API_KEY` | `AI_PROVIDER=deepseek` 时必填 | DeepSeek API Key |
| `INTERNAL_LLM_API_URL` | `AI_PROVIDER=internal` 时必填 | 公司内部大模型接口地址 |
| `INTERNAL_LLM_APP_TOKEN` | `AI_PROVIDER=internal` 时必填 | 内网模型网关 `app-token` |
| `INTERNAL_LLM_APP_ID` | `AI_PROVIDER=internal` 时必填 | 内网模型 `appId` |
| `INTERNAL_LLM_MODEL` | 否 | 内网模型名称，默认 `deepseekr1` |
| `INTERNAL_LLM_P13` | 否 | 内网请求体中的 `p13` |
| `INTERNAL_LLM_ORGANIZATION` | 否 | 内网请求体中的 `organization` |
| `INTERNAL_LLM_SECOND_LEVEL_ORG` | 否 | 内网请求体中的 `secondLevelOrg` |
| `INTERNAL_LLM_BUSI_DEPT` | 否 | 内网请求体中的 `busiDept` |
| `INTERNAL_LLM_TOP_P` | 否 | 内网请求体中的 `top_p`，默认 `0.7` |
| `INTERNAL_LLM_TOP_K` | 否 | 内网请求体中的 `top_k`，默认 `50` |
| `INTERNAL_LLM_BIZ_NO_PREFIX` | 否 | 内网请求流水号前缀，默认 `AITEST` |

### 运行时与认证

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `APP_RUNTIME_DIR` | 否 | 运行时根目录，默认使用项目同级 `CodeX.AITest.runtime`；后端会先读取进程环境变量，其次读取项目根 `.env` 中的该值来定位 runtime `.env` |
| `APP_LOG_DIR` | 否 | 日志目录，默认 `APP_RUNTIME_DIR\\logs` |
| `DB_PATH` | 否 | SQLite 数据库路径，默认 `APP_RUNTIME_DIR\\data\\codetestguard.db` |
| `SESSION_SECRET` | 是 | 会话签名密钥 |
| `INITIAL_ADMIN_USERNAME` | 是 | 初始化管理员账号 |
| `INITIAL_ADMIN_PASSWORD` | 是 | 初始化管理员密码 |
| `INITIAL_ADMIN_DISPLAY_NAME` | 否 | 初始化管理员显示名 |
| `CORS_ALLOW_ORIGINS` | 否 | 允许的跨域来源，逗号分隔 |
| `SESSION_COOKIE_SECURE` | 否 | Cookie 是否仅限 HTTPS |
| `SESSION_COOKIE_SAMESITE` | 否 | Cookie SameSite 策略 |
| `EXTERNAL_AUTH_URL` | 否 | 公司内部账号认证接口；配置后本地认证失败时会回退调用 |
| `EXTERNAL_AUTH_TIMEOUT_MS` | 否 | 公司内部账号认证超时时间，默认 `10000` |
| `VITE_API_URL` | 否 | 前端 API 基地址；未配置时默认优先使用 `/api`，若检测到本地 `localhost/127.0.0.1/0.0.0.0` 的非 `8000` 端口或 `file://` 打开页面，则自动回退到本机 `8000` 端口；其中 `localhost` 页面会请求 `http://localhost:8000/api`，`127.0.0.1` 页面会请求 `http://127.0.0.1:8000/api`，`0.0.0.0` 页面会规范化到 `http://127.0.0.1:8000/api`，避免登录 Cookie 因主机名不一致而丢失 |

## 当前菜单与路由

### 侧边栏菜单

| 一级菜单 | 二级菜单 | 三级菜单 | 当前行为 |
| --- | --- | --- | --- |
| 质量看板 | 效能分析 | - | 仅管理员可见，占位入口，点击提示“敬请期待” |
| 质量看板 | 质量分析 | 生产问题分析 | 复用现有页面，路由 `/issue-analysis` |
| 质量看板 | 质量分析 | 测试问题分析 | 复用现有页面，路由 `/defect-analysis` |
| 功能测试 | 案例生成 | - | 路由 `/functional-testing/case-generation`；支持选择提示词、上传需求文档、生成并导出测试用例 |
| 功能测试 | 案例质检 | - | 路由 `/functional-testing/case-quality` |
| 功能测试 | 分析记录 | - | 路由 `/functional-testing/records` |
| 自动化测试 | UI 自动化 | - | 占位入口 |
| 自动化测试 | 接口自动化 | - | 路由 `/automation-testing/api` |
| 性能测试 | 压测场景 / 脚本生成 / 脚本执行 / 性能调优 | - | 均为占位入口 |
| AI 辅助工具 | AI 助手 | - | 路由 `/ai-tools/agents` |
| AI 辅助工具 | PDF 核对 / 数据生成 / 回归验证 / 端到端测试 | - | 均为占位入口 |
| 项目管理 | 项目列表 | - | 路由 `/project-management` |
| 配置管理 | 生产问题 | - | 路由 `/production-issues` |
| 配置管理 | 测试问题 | - | 路由 `/test-issues` |
| 配置管理 | 提示词管理 | - | 路由 `/config-management/prompt-templates` |
| 配置管理 | 需求映射关系 | - | 路由 `/requirement-mappings` |
| 配置管理 | 代码映射关系 | - | 路由 `/projects` |
| 系统管理 | 用户管理 | - | 管理员可见，路由 `/users` |
| 系统管理 | 操作记录 | - | 管理员可见，路由 `/operation-logs` |

### 已启用路由

- `/login`
- `/`
- `/functional-testing/case-generation`
- `/functional-testing/case-quality`
- `/functional-testing/records`
- `/functional-testing/records/:id`
- `/automation-testing/api`
- `/ai-tools/agents`
- `/issue-analysis`
- `/defect-analysis`
- `/requirement-analysis`
- `/requirement-analysis/history`
- `/project-management`
- `/production-issues`
- `/test-issues`
- `/config-management/prompt-templates`
- `/requirement-mappings`
- `/projects`
- `/project/:id`
- `/history`
- `/users`
- `/operation-logs`

说明：

- 根路由 `/` 默认重定向到 `/functional-testing/case-quality`
- `/functional-testing/case-generation` 已接入侧边栏菜单，用于按需求文档生成功能测试用例并支持导出
- `/requirement-analysis`、`/requirement-analysis/history`、`/history` 当前不直接暴露在侧边栏
- 除 `/login` 外，其余页面均受登录保护

## 页面实际行为

### 提示词管理

- 页面显示提示词列表，不直接在表格中展示提示词内容
- 点击“详情”后，通过弹窗展示完整提示词
- 支持新增、编辑、删除提示词
- 新增或编辑提示词保存成功后，编辑弹窗会自动关闭
- 配置管理 > 提示词管理中的提示词会复用于功能测试案例生成、需求分析、案例分析、接口自动化文档解析、接口自动化用例生成等结构化 AI 场景；案例质检页当前固定按映射流程执行，不提供提示词选择
- 上述结构化 AI 场景仅在开启 AI 时允许选择并使用提示词；关闭 AI 时选择器会禁用，后端也不会使用任何提示词
- 若未手动选择提示词，则保持系统默认提示词行为，与当前版本原有输出保持一致
- 结构化 AI 场景实际发送给模型的是“选中的提示词 + 当前任务固定约束”的组合，不会直接替换掉任务本身的结构化输出要求
- 提示词数据持久化到 SQLite
- 前端未配置 `VITE_API_URL` 时，会在本地预览端口 `4173`、开发端口 `5173` 以及 `file://` 场景自动请求本机 `8000` 端口的 `/api/prompt-templates`；如果页面是 `localhost` 打开则请求 `http://localhost:8000/api/prompt-templates`，如果页面是 `127.0.0.1` 打开则请求 `http://127.0.0.1:8000/api/prompt-templates`，避免保存提示词时命中前端静态服务返回 `404 Not Found`，同时避免登录后因 Cookie 主机名不一致导致后续接口变成 `401`
- 系统初始化时会默认写入 4 条提示词：
  - `general`：通用助手
  - `requirement`：需求分析师
  - `testcase`：测试用例专家
  - `api`：接口自动化助手

### 案例生成

- 页面路由为 `/functional-testing/case-generation`，侧边栏“功能测试 > 案例生成”已直接跳转到该页
- 页面顶部当前展示标题“案例生成工作台”和标签，不再展示额外引导副文案和默认推荐卡片
- 页面流程固定为“选择提示词 -> 上传需求文档 -> 生成测试用例 -> 查看表格 -> 导出用例”
- 提示词来源于配置管理 > 提示词管理，页面会优先预选 `requirement`，即“需求分析师”
- 上传控件前端仅接受 `.docx`，后端也按 `.docx` 进行 Word 内容校验
- 点击“生成测试用例”后会展示与主按钮同色系的能量核心过渡动画，底部不再显示阶段文字；阶段轮换会以环绕核心的无文字节点高亮呈现，内部阶段顺序仍为“解析需求章节结构”“提炼关键业务场景”“编排测试步骤与断言”“装配导出清单”
- 结果表格固定展示 `用例ID`、`用例描述`、`测试步骤`、`预期结果`
- 生成结果区域提供“导出用例”按钮，当前导出格式为 UTF-8 BOM 编码的 CSV 文件
- 后端会优先调用 AI 生成结构化用例；若 AI 不可用，会自动回退为规则生成，并在结果中返回 `generation_mode`、`error` 等信息

### 案例质检

- 页面路由为 `/functional-testing/case-quality`
- 第 2 步“需求分析”仅做需求映射，不显示提示词选择器，不触发 AI 结论区，页面调用接口时固定传 `use_ai=false`
- 第 3 步“案例分析”仅做代码映射与覆盖分析，不显示提示词选择器，不触发 AI 建议区，页面调用接口时固定传 `use_ai=false`
- 第 2 步“需求分析”和第 3 步“案例分析”在步骤操作区只保留上传与执行入口，不展示“需求分析概览”“案例分析结果”等报告内容，也不提供需求分析“查看详情”按钮
- 完整的需求分析内容、案例分析内容、测试建议和综合摘要只在第 4 步“汇总报告”与“案例质检记录详情”中展示
- 第 4 步“汇总报告”与“案例质检记录详情”会额外展示一块“AI 测试意见”，基于需求分析快照、案例分析快照、需求映射建议与代码映射建议生成 `必测项 / 补测项 / 建议回归范围 / 仍缺信息`
- 汇总报告中的 AI 测试意见不复用第 2、3 步的 `ai_analysis`；后端会单独生成 `combined_result_snapshot.ai_test_advice`
- 若 AI 配置缺失或调用失败，汇总报告仍保留需求映射建议、代码映射建议、覆盖结果与评分，同时在“AI 测试意见”区域展示未生成原因
- 生成案例质检记录时，`case_result_snapshot.ai_analysis` 与 `combined_result_snapshot.case_report.ai_analysis` 仍会固定清空，避免汇总报告回放旧的案例 AI 建议

### AI 助手

- 页面菜单名称为“AI 助手”，路由仍为 `/ai-tools/agents`
- 若提示词列表中存在 `general`，页面默认优先选中“通用助手”
- 若提示词列表为空，页面会自动切换到“默认AI助手”，默认不使用提示词，也不会禁用输入区
- 若提示词列表接口返回 `404`，前端会按“无提示词”处理，直接启用默认AI助手
- 配置管理中的提示词会作为可切换的回答风格来源；存在提示词时，可在页面底部切换使用
- 支持上传多个附件，也支持完全不上传附件时直接对话
- 初始空白态会居中展示欢迎标题与大输入框；若存在多个提示词，可在输入框底部切换当前助手
- 输入框正文与占位提示会保留更稳定的上下内边距，避免首行文字紧贴顶部出现遮挡
- Word 附件会按文件内容自动识别 `doc` / `docx`；即使文件名是 `.docx`，只要内容实际为旧版 `.doc`，也会按旧版 Word 解析，而不是直接报后端连接失败
- 进入对话后会切换为极简消息流布局：标题收敛到顶部、消息区域居中展开、输入框吸附在页面底部，便于连续追问
- 页面为聊天流样式，支持连续追问；当前浏览器会保存最近一次会话内容，刷新页面后仍会恢复当前会话视图
- 页面会对历史消息和接口返回消息做兜底归一化；即使消息缺少 `attachments` 字段，也会按“无附件”安全渲染，避免对话页报错
- 助手回复下方当前仅提供“复制”操作，不提供重新生成、点赞、点踩、分享等未落地功能
- 每次提交后，后端会返回 `conversation_id`，后续追问会自动带上该会话 ID 继续拼接历史上下文
- 点击“新建对话”或在已有会话中切换助手时，会开启新的对话上下文
- 仍兼容后端 `custom` 自定义提示词接口参数，但前端当前不再提供“自定义AI助手”输入框

## 主要接口

### 健康检查

- `GET /api/health`

### 认证与用户

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/{user_id}`
- `PUT /api/users/{user_id}/status`
- `PUT /api/users/{user_id}/password`
- `DELETE /api/users/{user_id}`

### 操作记录

- `GET /api/audit-logs`
- 审计日志以及其他数据库时间字段会在接口层统一返回带时区的 UTC ISO 8601 字符串，例如 `2026-03-30T08:00:00Z`；前端再按浏览器本地时区格式化显示，避免部署到不同时区服务器后出现时间偏差。

### 生产 / 测试问题文件

- `POST /api/issue-analysis/import`
- `POST /api/defect-analysis/import`
- `GET /api/production-issue-files`
- `POST /api/production-issue-files`
- `GET /api/production-issue-files/{file_id}/analysis`
- `GET /api/test-issue-files`
- `POST /api/test-issue-files`
- `GET /api/test-issue-files/{file_id}/analysis`

### 提示词管理

- `GET /api/prompt-templates`
- `POST /api/prompt-templates`
- `PUT /api/prompt-templates/{template_id}`
- `DELETE /api/prompt-templates/{template_id}`

请求字段：

- `name`
- `prompt`

返回字段：

- `id`
- `agent_key`
- `name`
- `prompt`
- `created_at`
- `updated_at`

说明：

- 结构化 AI 场景透传的 `prompt_template_key` 对应这里返回的 `agent_key`

### 功能测试案例生成

- `POST /api/functional-testing/case-generation/generate`

当前行为补充：

- 使用 `multipart/form-data`
- 必填字段：`requirement_file`
- 可选字段：`prompt_template_key`
- 前端当前仅接受 `.docx`；后端按 `.docx` 类型进行 Word 内容校验
- 响应 `data` 包含 `file_name`、`prompt_template_key`、`summary`、`generation_mode`、`provider`、`ai_cost`、`error`、`total`、`cases`
- `cases` 中每条用例包含 `case_id`、`description`、`steps`、`expected_result`
- AI 生成失败时接口会自动回退为基础规则生成，仍返回可展示、可导出的测试用例结果

### 项目与代码映射

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `PUT /api/projects/{project_id}`
- `DELETE /api/projects/{project_id}`
- `POST /api/projects/{project_id}/mapping`
- `POST /api/projects/{project_id}/mapping/entries`
- `PUT /api/projects/{project_id}/mapping/entries`
- `DELETE /api/projects/{project_id}/mapping/entries`
- `GET /api/project-mapping-template`

### 需求映射与需求分析

- `GET /api/requirement-mapping-template`
- `GET /api/projects/{project_id}/requirement-mapping`
- `POST /api/projects/{project_id}/requirement-mapping`
- `PUT /api/projects/{project_id}/requirement-mapping`
- `POST /api/requirement-analysis/analyze`
- `GET /api/requirement-analysis/records`
- `GET /api/requirement-analysis/records/{record_id}`
- `GET /api/requirement-analysis/rules`
- `POST /api/requirement-analysis/rules`
- `PUT /api/requirement-analysis/rules/{rule_id}`
- `DELETE /api/requirement-analysis/rules/{rule_id}`

当前行为补充：

- `POST /api/requirement-analysis/analyze` 使用 `multipart/form-data`
- 必填字段：`project_id`、`requirement_file`
- 可选字段：`use_ai`、`prompt_template_key`
- 仅当 `use_ai=true` 时后端才会读取 `prompt_template_key`；未传时使用系统默认提示词，`use_ai=false` 时完全不使用提示词
- 案例质检页调用该接口时固定传 `use_ai=false`，因此该页的需求分析只输出需求映射结果，不展示 AI 结论

### 案例分析与案例质检

- `POST /api/analyze`
- `GET /api/records`
- `GET /api/records/{record_id}`
- `POST /api/case-quality/records`
- `GET /api/case-quality/records`
- `GET /api/case-quality/records/{record_id}`
- `POST /api/projects/{project_id}/analyze`

当前行为补充：

- `POST /api/analyze` 使用 `multipart/form-data`
- 必填字段：`code_changes`、`test_cases_file`
- 可选字段：`mapping_file`、`use_ai`、`prompt_template_key`
- `POST /api/projects/{project_id}/analyze` 也使用 `multipart/form-data`
- `POST /api/projects/{project_id}/analyze` 的 `prompt_template_key` 通过 query 参数传递
- 案例分析、案例质检中的 AI 分析仅当 `use_ai=true` 时后端才会读取 `prompt_template_key`；未传时使用系统默认提示词，`use_ai=false` 时完全不使用提示词
- 案例质检页调用 `POST /api/projects/{project_id}/analyze` 时固定传 `use_ai=false`，因此该页的案例分析只保留代码映射、覆盖结果与评分
- `POST /api/projects/{project_id}/analyze` 生成的分析记录会持久化 `test_case_count`，供 `/api/records/{record_id}` 和 `/api/case-quality/records/{record_id}` 直接回放
- `POST /api/case-quality/records` 会在写入案例质检汇总记录时额外生成 `combined_result_snapshot.ai_test_advice`，供汇总报告与案例质检记录详情直接回放 AI 测试意见
- `POST /api/case-quality/records` 仍会清空 `case_result_snapshot.ai_analysis` 与 `combined_result_snapshot.case_report.ai_analysis`，避免汇总报告继续展示旧的案例 AI 建议
- `POST /api/case-quality/records` 返回的 `total_token_usage` 会累计需求分析、案例分析以及汇总报告 AI 测试意见的 token 统计
- 历史案例质检记录若快照中缺少 `test_case_count`，前后端会从评分快照维度详情中回填案例数，避免报告页显示 `--`

### AI 助手

- `POST /api/ai-tools/agents/chat`

请求方式：

- `multipart/form-data`

请求字段：

- `question`
- `agent_key`：可选；留空时默认使用无提示词的默认AI助手
- `custom_prompt`：自定义AI助手提示词，可选
- `conversation_id`：可选；首轮对话不传，续聊时传入上一次返回的会话 ID
- `attachments`

说明：

- `agent_key` 默认取自 `/api/prompt-templates` 返回的 `agent_key`
- `custom_prompt` 仅在 `agent_key=custom` 时需要
- 后端会按 `agent_key` 读取数据库中的提示词配置
- 若未上传附件，AI 助手仍会直接基于用户问题正常作答，不会默认要求先上传附件
- 若传入 `conversation_id`，后端会读取该会话最近几轮消息与附件上下文，继续完成多轮问答
- 上传 Word 附件时，后端会优先按文件内容识别 `doc` / `docx`；对“扩展名为 `.docx`、内容实际为旧版 `.doc`”的文件会按旧版 Word 解析，并在无效 Word 文件时返回明确的 400 错误提示

响应字段：

- `answer`
- `provider`
- `provider_key`
- `agent_key`
- `agent_name`
- `prompt_used`
- `conversation_id`
- `conversation_title`
- `attachments`
- `user_message`
- `assistant_message`

当前支持的附件格式：

- `csv`
- `xls`
- `xlsx`
- `json`
- `doc`
- `docx`
- `pdf`
- `yaml`
- `yml`

### 接口自动化

- `GET /api/projects/{project_id}/api-automation/environment`
- `PUT /api/projects/{project_id}/api-automation/environment`
- `POST /api/projects/{project_id}/api-automation/documents`
- `GET /api/projects/{project_id}/api-automation/documents/latest`
- `POST /api/projects/{project_id}/api-automation/cases/generate`
- `GET /api/projects/{project_id}/api-automation/suites/latest`
- `GET /api/projects/{project_id}/api-automation/suites/{suite_id}`
- `PUT /api/projects/{project_id}/api-automation/suites/{suite_id}`
- `GET /api/projects/{project_id}/api-automation/runs`
- `POST /api/projects/{project_id}/api-automation/runs`
- `GET /api/projects/{project_id}/api-automation/runs/{run_id}`
- `GET /api/projects/{project_id}/api-automation/runs/{run_id}/report`
- `POST /api/projects/{project_id}/api-automation/runs/{run_id}/rerun`

当前行为补充：
- `POST /api/projects/{project_id}/api-automation/documents` 使用 `multipart/form-data`
- 字段：`document_file`、`use_ai`；当需要指定提示词时，通过 query 参数传 `prompt_template_key`
- `POST /api/projects/{project_id}/api-automation/cases/generate` 使用 JSON 请求体
- 字段：`use_ai`、`name`、`prompt_template_key`
- 接口自动化文档解析与用例生成仅当 `use_ai=true` 时后端才会读取 `prompt_template_key`；未传时使用系统默认提示词，`use_ai=false` 时完全不使用提示词
- 接口自动化页面的“执行环境”支持在“高级 JSON 配置”保持默认折叠时直接保存；未展开的 `common_headers`、`auth_config`、`signature_template`、`login_binding` 会按当前表单值或默认 `{}` 一并提交。
- 高级 JSON 配置中的公共请求头、鉴权配置、签名模板、登录绑定都必须是合法 JSON；保存失败时页面会优先提示具体字段名。

### 历史映射

- `GET /api/mapping`
- `GET /api/mapping/latest`
- `GET /api/mapping/{mapping_id}`
- `POST /api/mapping`
- `DELETE /api/mapping/{mapping_id}`

## 当前支持的文件格式

### 通用上传校验接口

- `csv`
- `xls`
- `xlsx`
- `json`

### AI 助手附件

- `csv`
- `xls`
- `xlsx`
- `json`
- `doc`
- `docx`
- `pdf`
- `yaml`
- `yml`

### 接口自动化文档

- `pdf`
- `doc`
- `docx`
- `json`
- `yaml`
- `yml`

### 功能测试案例生成

- `.docx`

### 需求分析

- `doc`
- `docx`

### 需求映射

- `xls`
- `xlsx`

### 代码映射

- `csv`
- `xls`
- `xlsx`

### 生产 / 测试问题文件

- `csv`
- `xls`
- `xlsx`

## AI 接入说明

### 当前支持的提供方

- `deepseek`：使用 DeepSeek OpenAI 兼容接口
- `internal`：使用公司内部大模型接口

### 公司内部大模型接入

当 `AI_PROVIDER=internal` 时，后端会组装如下能力：

- 请求头带 `app-token`
- 请求体包含 `appId`、`bizNo`、`model`、`max_tokens`、`temperature`、`top_p`、`top_k`、`messages`
- 若配置了 `INTERNAL_LLM_P13`、`INTERNAL_LLM_ORGANIZATION`、`INTERNAL_LLM_SECOND_LEVEL_ORG`、`INTERNAL_LLM_BUSI_DEPT`，也会一并透传
- AI 助手问答、需求分析、案例分析、接口文档增强等所有 AI 场景共用同一套 `AI_PROVIDER` 配置，不存在 AI 助手单独写死 DeepSeek 的分支

### 文本返回处理

对于 AI 助手问答这类文本场景，后端会：

1. 提取模型最终可见内容
2. 自动移除 `<think>...</think>` 推理块
3. 保留清洗后的 `final_content`
4. 将清洗后的文本作为 `answer` 返回前端

### JSON 返回处理

对于需求分析、案例分析、接口文档增强等结构化场景，后端仍按 JSON 结果解析并落库。

- 若前端选择了提示词，后端会在保留当前任务固定约束的前提下叠加该提示词，再向模型发起请求
- 若 `use_ai=false`，这些结构化场景会完全跳过提示词解析与 AI 提示词拼装

### Token 与金额字段

- 所有 AI 调用当前只保留 `total_tokens` 统计，不再计算真实金额
- 前端页面与导出 HTML 报告不再展示输入金额、输出金额或总金额
- 若接口响应仍包含 `cost`、`total_cost` 等兼容字段，当前统一返回 `0`

## 验证命令

本次代码已验证：

```bash
python -m pytest api/tests/test_requirement_case_generation_api.py api/tests/test_requirement_analysis_api.py api/tests/test_ai_agent_api.py api/tests/test_api_automation_api.py
```

```bash
npm test -- src/pages/Upload.test.tsx src/components/Layout/AppLayout.test.tsx src/utils/api.test.ts src/utils/exportTestCases.test.ts
```

```bash
npm run build
```

如需完整前端测试：

```bash
npm run test
```

## 注意事项

- 界面文案与说明文档默认使用中文
- AI 助手问答依赖与全站一致的 AI 配置；若未配置 `DEEPSEEK_API_KEY` 或内网模型参数，对应接口会直接返回错误
- AI 助手当前支持多轮上下文续聊；会话与消息元数据会持久化到 SQLite，但前端当前只恢复最近一次本地会话，不提供历史会话列表页
- AI 助手附件只做文本抽取与上下文拼装，不做原始文件持久化
- 若删除全部提示词，AI 助手页会自动回退到默认AI助手，而不是禁用输入区
- 所有 AI 场景当前仅保留 token 统计；历史记录、需求分析历史、案例质检记录、分析详情和导出报告均不展示金额
- 当前接口自动化执行为同步串行执行，没有 WebSocket 实时进度
- 发布时建议采用“新代码目录 + 复用同一 runtime 目录”的方式
- 后端默认放行本地 `http://localhost:4173`、`http://127.0.0.1:4173`、`http://localhost:5173`、`http://127.0.0.1:5173` 的跨域访问；其他来源请通过 `CORS_ALLOW_ORIGINS` 显式配置
- 如果功能页接口持续返回 404，先检查当前 `8000` 端口是否仍被旧的 Python 后端进程占用；推荐优先使用 `start-dev.bat --restart` 释放开发端口后再启动

最后更新：2026-03-31
## 登录页面行为补充

- 登录页面与登录加载态会占满当前浏览器可视高度，避免页面底部出现大面积空白或露出全局背景
- 登录页面高度优先使用 `100dvh`，在不支持的浏览器中回退到 `100vh`
