# 智测平台

当前仓库是一个前后端一体化的测试工作台，前端基于 React + Vite，后端基于 FastAPI + SQLite。

当前实际已实现的能力包括：

- 质量看板：生产问题分析、测试问题分析
- 功能测试：案例生成入口、案例质检、分析记录、记录详情
- 需求分析：需求文档解析、需求映射、过滤规则、历史记录
- 接口自动化：接口文档解析、用例生成、用例编辑、执行、报告、重跑
- AI 辅助工具：AI 助手问答，支持附件分析
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

| 一级菜单 | 二级菜单 | 当前行为 |
| --- | --- | --- |
| 质量看板 | 生产问题分析 | 路由 `/issue-analysis` |
| 质量看板 | 测试问题分析 | 路由 `/defect-analysis` |
| 功能测试 | 案例生成 | 菜单为占位入口，点击提示“敬请期待”；路由仍可直达 `/functional-testing/case-generation` |
| 功能测试 | 案例质检 | 路由 `/functional-testing/case-quality` |
| 功能测试 | 分析记录 | 路由 `/functional-testing/records` |
| 自动化测试 | UI 自动化 | 占位入口 |
| 自动化测试 | 接口自动化 | 路由 `/automation-testing/api` |
| 性能测试 | 压测 / 脚本生成 / 脚本执行 / 调优 | 均为占位入口 |
| AI 辅助工具 | AI 助手 | 路由 `/ai-tools/agents` |
| AI 辅助工具 | PDF 核对 / 数据生成 / 回归验证 / 端到端测试 | 均为占位入口 |
| 项目管理 | 项目列表 | 路由 `/project-management` |
| 配置管理 | 生产问题 | 路由 `/production-issues` |
| 配置管理 | 测试问题 | 路由 `/test-issues` |
| 配置管理 | 提示词管理 | 路由 `/config-management/prompt-templates` |
| 配置管理 | 需求映射关系 | 路由 `/requirement-mappings` |
| 配置管理 | 代码映射关系 | 路由 `/projects` |
| 系统管理 | 用户管理 | 管理员可见，路由 `/users` |
| 系统管理 | 操作记录 | 管理员可见，路由 `/operation-logs` |

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
- `/functional-testing/case-generation` 当前可直达，但菜单入口仍是占位
- `/requirement-analysis`、`/requirement-analysis/history`、`/history` 当前不直接暴露在侧边栏
- 除 `/login` 外，其余页面均受登录保护

## 页面实际行为

### 提示词管理

- 页面显示提示词列表，不直接在表格中展示提示词内容
- 点击“详情”后，通过弹窗展示完整提示词
- 支持新增、编辑、删除提示词
- 提示词数据持久化到 SQLite
- 前端未配置 `VITE_API_URL` 时，会在本地预览端口 `4173`、开发端口 `5173` 以及 `file://` 场景自动请求本机 `8000` 端口的 `/api/prompt-templates`；如果页面是 `localhost` 打开则请求 `http://localhost:8000/api/prompt-templates`，如果页面是 `127.0.0.1` 打开则请求 `http://127.0.0.1:8000/api/prompt-templates`，避免保存提示词时命中前端静态服务返回 `404 Not Found`，同时避免登录后因 Cookie 主机名不一致导致后续接口变成 `401`
- 系统初始化时会默认写入 4 条提示词：
  - `general`：通用助手
  - `requirement`：需求分析师
  - `testcase`：测试用例专家
  - `api`：接口自动化助手

### AI 助手

- 页面菜单名称为“AI 助手”，路由仍为 `/ai-tools/agents`
- 若提示词列表为空，页面会自动切换到“默认AI助手”，默认不使用提示词，也不会禁用输入区
- 若提示词列表接口返回 `404`，前端会按“无提示词”处理，直接启用默认AI助手
- 配置管理中的提示词会作为可切换的回答风格来源；存在提示词时，可在页面底部切换使用
- 支持上传多个附件
- 提交后仅展示当前这一轮问答结果，不提供多轮会话历史
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

### 案例分析与案例质检

- `POST /api/analyze`
- `GET /api/records`
- `GET /api/records/{record_id}`
- `POST /api/case-quality/records`
- `GET /api/case-quality/records`
- `GET /api/case-quality/records/{record_id}`
- `POST /api/projects/{project_id}/analyze`

褰撳墠琛屼负琛ュ厖锛?
- `POST /api/projects/{project_id}/analyze` 鐢熸垚鐨勫垎鏋愯褰曚細鎸佷箙鍖?`test_case_count`锛屼緵 `/api/records/{record_id}` 鍜?`/api/case-quality/records/{record_id}` 鐩存帴鍥炴斁
- 鍘嗗彶妗堜緥璐ㄦ璁板綍鑻ュ揩鐓т腑缂哄皯 `test_case_count`锛屽墠鍚庣浼氫粠璇勫垎蹇収缁村害璇︽儏涓洖濉渚嬫暟锛岄伩鍏嶆姤鍛婇〉鏄剧ず `--`

### AI 助手

- `POST /api/ai-tools/agents/chat`

请求方式：

- `multipart/form-data`

请求字段：

- `question`
- `agent_key`：可选；留空时默认使用无提示词的默认AI助手
- `custom_prompt`：自定义AI助手提示词，可选
- `attachments`

说明：

- `agent_key` 默认取自 `/api/prompt-templates` 返回的 `agent_key`
- `custom_prompt` 仅在 `agent_key=custom` 时需要
- 后端会按 `agent_key` 读取数据库中的提示词配置

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

### Token 与金额字段

- 所有 AI 调用当前只保留 `total_tokens` 统计，不再计算真实金额
- 前端页面与导出 HTML 报告不再展示输入金额、输出金额或总金额
- 若接口响应仍包含 `cost`、`total_cost` 等兼容字段，当前统一返回 `0`

## 验证命令

本次代码已验证：

```bash
python -m pytest api/tests/test_database.py api/tests/test_deepseek_client.py api/tests/test_deepseek_text_client.py -q
```

如需完整前端测试：

```bash
npm run test
```

## 注意事项

- 界面文案与说明文档默认使用中文
- AI 助手问答依赖与全站一致的 AI 配置；若未配置 `DEEPSEEK_API_KEY` 或内网模型参数，对应接口会直接返回错误
- AI 助手当前只展示单次结果，不提供多轮上下文续聊
- AI 助手附件只做文本抽取与上下文拼装，不做文件持久化
- 若删除全部提示词，AI 助手页会自动回退到默认AI助手，而不是禁用输入区
- 所有 AI 场景当前仅保留 token 统计；历史记录、需求分析历史、案例质检记录、分析详情和导出报告均不展示金额
- 当前接口自动化执行为同步串行执行，没有 WebSocket 实时进度
- 发布时建议采用“新代码目录 + 复用同一 runtime 目录”的方式
- 后端默认放行本地 `http://localhost:4173`、`http://127.0.0.1:4173`、`http://localhost:5173`、`http://127.0.0.1:5173` 的跨域访问；其他来源请通过 `CORS_ALLOW_ORIGINS` 显式配置

最后更新：2026-03-30
## 登录页面行为补充

- 登录页面与登录加载态会占满当前浏览器可视高度，避免页面底部出现大面积空白或露出全局背景
- 登录页面高度优先使用 `100dvh`，在不支持的浏览器中回退到 `100vh`
