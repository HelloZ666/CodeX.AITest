# 智测平台（当前实际行为）

这是一个前后端一体的测试工作台，前端基于 React + Vite，后端基于 FastAPI + SQLite。当前代码已经包含以下核心能力：

- 质量看板：生产问题分析、测试问题分析
- 功能测试：案例生成、案例质检、分析记录
- 需求分析：需求文档解析、规则维护、历史记录
- 项目与配置管理：项目、代码映射、需求映射、问题文件管理
- 自动化测试：接口自动化首版

文档只记录仓库当前已经实现并可运行的行为，不保留失效流程或旧命名。

## 1. 技术栈与依赖

### 前端

- React 19
- TypeScript 5
- Vite 7
- Ant Design 6
- React Router 7
- TanStack React Query 5
- Axios 1
- ECharts 6
- file-saver

### 后端

- FastAPI
- Uvicorn
- Pydantic 2
- SQLite
- OpenAI SDK
- python-multipart
- openpyxl / xlrd / xlwt
- python-docx / olefile
- javalang
- loguru
- PyMuPDF
- PyYAML

## 2. 目录结构

```text
.
├─ api/                  # FastAPI 后端
├─ public/               # 前端静态资源
├─ sample_files/         # 示例文件
├─ src/                  # React 前端
├─ .env.example          # 环境变量示例
├─ package.json          # 前端脚本与依赖
├─ requirements.txt      # 后端依赖
└─ start-dev.bat         # 本地一键启动
```

## 3. 安装与启动

### 环境要求

- Node.js 20+
- Python 3.11+
- Windows PowerShell / CMD

### 安装依赖

```bash
npm install
pip install -r requirements.txt
```

### 环境变量

```bash
copy .env.example .env
```

### 一键启动

```bash
start-dev.bat
```

启动后默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`
- 健康检查：`http://127.0.0.1:8000/api/health`

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

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 否 | 需求分析、接口自动化 AI 补全使用；未配置时 AI 相关能力会降级或跳过 |
| `SESSION_SECRET` | 是 | 登录会话签名密钥 |
| `INITIAL_ADMIN_USERNAME` | 是 | 首次初始化管理员账号 |
| `INITIAL_ADMIN_PASSWORD` | 是 | 首次初始化管理员密码 |
| `INITIAL_ADMIN_DISPLAY_NAME` | 否 | 首次初始化管理员显示名 |
| `DB_PATH` | 否 | SQLite 文件路径，默认 `api/data/codetestguard.db` |
| `CORS_ALLOW_ORIGINS` | 否 | 允许的跨域来源，逗号分隔 |
| `SESSION_COOKIE_SECURE` | 否 | Cookie 是否仅限 HTTPS |
| `SESSION_COOKIE_SAMESITE` | 否 | Cookie SameSite 策略 |

### 前端环境变量

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_API_URL` | 否 | 前端 API 基地址；未配置时默认使用 `/api` |

## 5. 当前菜单与路由

### 侧边栏当前可见菜单

| 一级菜单 | 二级菜单 | 当前行为 |
| --- | --- | --- |
| 质量看板 | 生产问题分析 | 路由 `/issue-analysis` |
| 质量看板 | 测试问题分析 | 路由 `/defect-analysis` |
| 功能测试 | 案例生成 | 路由 `/functional-testing/case-generation` |
| 功能测试 | 案例质检 | 路由 `/functional-testing/case-quality` |
| 功能测试 | 分析记录 | 路由 `/functional-testing/records` |
| 自动化测试 | UI 自动化 | 仅提示“敬请期待”，不跳转 |
| 自动化测试 | 接口自动化 | 路由 `/automation-testing/api` |
| 性能测试 | 压测 / 脚本生成 / 脚本执行 / 调优 | 仅提示“敬请期待”，不跳转 |
| AI 辅助工具 | PDF 校对 / 数据生成 / 回归验证 / 端到端测试 | 仅提示“敬请期待”，不跳转 |
| 项目管理 | 项目列表 | 路由 `/project-management` |
| 配置管理 | 生产问题 | 路由 `/production-issues` |
| 配置管理 | 测试问题 | 路由 `/test-issues` |
| 配置管理 | 需求映射关系 | 路由 `/requirement-mappings` |
| 配置管理 | 代码映射关系 | 路由 `/projects` |
| 系统管理 | 用户管理 | 仅管理员可见，路由 `/users` |

### 当前受保护路由

- `/`
- `/functional-testing/case-generation`
- `/automation-testing/api`
- `/functional-testing/case-quality`
- `/functional-testing/records`
- `/functional-testing/records/:id`
- `/issue-analysis`
- `/defect-analysis`
- `/requirement-analysis`
- `/requirement-analysis/history`
- `/project-management`
- `/production-issues`
- `/test-issues`
- `/requirement-mappings`
- `/projects`
- `/project/:id`
- `/history`
- `/users`

### 当前公开路由

- `/login`

说明：

- 侧边栏默认展开，并自动展开当前路由所在的一级菜单；手动收起后可将鼠标悬浮到一级菜单上查看并点击二级菜单。
- `配置管理` 与 `系统管理` 当前使用不同的一级菜单图标，便于区分配置入口与用户管理入口。
- 根路由 `/` 与未命中路由默认重定向到 `/functional-testing/case-quality`。
- `/requirement-analysis`、`/requirement-analysis/history`、`/history` 当前存在路由，但不在侧边栏直接暴露。
- 未登录访问受保护路由会被拦截。

## 6. 接口自动化首版

### 页面入口

- 前端路由：`/automation-testing/api`
- 侧边栏位置：`自动化测试 > 接口自动化`

### 当前实际流程

- 页面布局为“顶部横向步骤流 + 下方当前步骤操作板块”，已解锁步骤支持点击切换。
- 页头卡片当前仅展示标题、状态标签与 AI 案例补全开关，不再显示路径提示和功能说明文案。
1. 选择项目，并加载该项目最近一次接口自动化上下文
2. 配置单项目单活动环境
3. 上传接口文档；只有本次文档解析成功后才展示当前接口清单，历史接口信息在解析成功前不会显示
4. 生成、编辑并保存接口测试案例
5. 执行用例、查看报告、查看历史、重新执行、下载 JSON 报告
- “配置执行环境”步骤当前首屏只展示 `Base URL / 超时 / 鉴权方式`，`公共请求头 / 鉴权配置 / 签名模板 / 登录绑定` 改为默认折叠的高级 JSON 配置面板，按需展开编辑。

### 当前支持的文档类型

- PDF
- Word：`.doc` / `.docx`
- OpenAPI 3.x：`.json` / `.yaml` / `.yml`

说明：

- PDF 只支持可提取文本的文档，不做 OCR。
- 非结构化 PDF / Word 文档解析时，纯环境域名、Base URL 或说明链接不计入接口数量；只有真实接口路径会进入接口清单。
- 非结构化 PDF / Word 文档解析时，如果同一路径被重复提取，会按 1 个接口计数，并优先保留方法、名称、请求体和响应体更完整的那条记录。
- 接口清单主表仅展示接口名称、方法、路径、分组；依赖提示和缺失字段放到展开行里查看，长文本标签会自动换行。
- 上传后会保存文档解析快照。

### 当前支持的鉴权模式

- `none`
- `bearer`
- `basic`
- `cookie`
- `custom_header`
- `login_extract`

### 当前支持的签名模板能力

- 固定字段参与签名
- 自动写入时间戳字段和 Header
- 合并查询参数与请求体顶层标量字段
- key 排序
- `JSON.stringify`
- UTF-8 转十六进制
- `MD5 / SHA1 / SHA256 / HMAC-SHA256`
- 将签名结果写回指定 Header

这套模板就是当前代码里对 Postman 常见“参数排序 + 时间戳 + 固定盐值 + MD5/SHA/HMAC”脚本的替代方案。当前版本不执行任意 Postman `pre-request script` JavaScript。

### 当前案例与执行能力

- 规则生成基础案例
- AI 补全案例、断言、依赖和提取规则
- 接口自动化里的文档解析 AI 和案例补全 AI 单次最长等待 100 秒
- AI 返回如果被 ```json 代码块包裹，或在 JSON 前后夹带少量说明文字，后端会优先提取首个 JSON 对象继续解析；只有仍无法提取 JSON 时才提示“AI 返回格式异常”
- AI 补全超时或失败时，会自动回退为规则生成案例，不阻断用例集生成
- 用例表格主表仅展示启用、编号、场景、标题、方法、URL、预期状态码等核心字段；前置条件、请求头、请求参数、请求体、关键字段、数据库校验、断言规则、变量提取规则等内容放到展开行里编辑
- 支持 `{{env.xxx}}` 和 `{{runtime.xxx}}` 变量替换
- 执行前自动保存当前编辑稿
- 当前执行器按依赖顺序串行执行
- 当前报告支持页面查看和下载 JSON；在“执行记录”里点击“查看报告”后，会自动切换到对应执行报告、滚动回详情区，并高亮当前选中的历史记录

### 当前持久化表

- `api_test_environment_configs`
- `api_document_records`
- `api_test_suites`
- `api_test_runs`
- `api_test_run_items`

### 接口自动化相关后端接口

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

### 接口自动化相关前端类型与封装

- 类型定义：`src/types/index.ts`
- API 封装：`src/utils/api.ts`
- AI 提示词资源：`api/resources/api_automation_case_prompt.txt`

## 7. 其他主要后端接口分组

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

### 项目与映射

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

### 需求分析与映射

- `POST /api/requirement-analysis/analyze`
- `GET /api/requirement-analysis/records`
- `GET /api/requirement-analysis/records/{record_id}`
- `GET /api/requirement-analysis/rules`
- `POST /api/requirement-analysis/rules`
- `PUT /api/requirement-analysis/rules/{rule_id}`
- `DELETE /api/requirement-analysis/rules/{rule_id}`
- `GET /api/projects/{project_id}/requirement-mapping`
- `POST /api/projects/{project_id}/requirement-mapping`
- `PUT /api/projects/{project_id}/requirement-mapping`
- `GET /api/requirement-mapping-template`

### 案例质检与分析记录

- `POST /api/projects/{project_id}/analyze`
- `GET /api/records`
- `GET /api/records/{record_id}`
- `POST /api/case-quality/records`
- `GET /api/case-quality/records`
- `GET /api/case-quality/records/{record_id}`

### 生产 / 测试问题文件

- `POST /api/issue-analysis/import`
- `POST /api/defect-analysis/import`
- `GET /api/production-issue-files`
- `POST /api/production-issue-files`
- `GET /api/production-issue-files/{file_id}/analysis`
- `GET /api/test-issue-files`
- `POST /api/test-issue-files`
- `GET /api/test-issue-files/{file_id}/analysis`

## 8. 验证命令

当前已验证通过的命令：

```bash
npm test -- src/pages/ApiAutomation.test.tsx
npm run build
python -m pytest api/tests/test_deepseek_client.py api/tests/test_api_automation_case_generator.py api/tests/test_api_automation_api.py -q
```

### 接口自动化补充说明

- 接口自动化页在“生成接口测试用例”时，不再把整份解析后的接口文档和完整规则用例 JSON 全量发送给 AI，而是只发送精简上下文：接口概要、请求参数规范、响应提示、错误码、依赖提示、缺失字段和基础覆盖摘要。
- OpenAPI 文档解析会额外保留 query/path/header 参数上的 `enum`、`format`、`pattern`、`default`、长度范围、数值范围和数组数量约束，供接口自动化用例生成使用。
- DeepSeek 返回内容的 JSON 解析已做容错处理，支持纯 JSON、Markdown 代码块包裹 JSON，以及正文说明 + JSON 对象三种常见格式。

## 9. 当前注意事项

- 界面文案默认使用中文。
- 接口自动化当前是“单项目单活动环境”，不支持环境矩阵。
- 当前报告下载格式只有 JSON。
- 当前“预期数据库校验”列只是备注，不会真的连库执行 SQL 校验。
- 当前执行是同步串行执行，页面会显示执行中状态，执行完成后返回报告；没有 WebSocket 实时流式进度。
- 当前不支持客户端证书、浏览器 SSO、验证码、人机校验、复杂代理链。
- 如果你的内网接口在 Postman 成功依赖的是固定 token、固定 cookie、登录提取、公共 Header、签名模板这一类能力，那么当前首版可以覆盖；如果依赖更复杂的脚本执行环境，需要下一阶段扩展。

- 非结构化 PDF / Word 文档当前会按接口路径所在文本块逐段解析；当一份文档包含多个相对路径接口时，会逐个接口进入解析结果，而不是只保留第一个相对路径。
- 接口自动化页在“上传接口文档”步骤中，上传完成后直接展示当前接口清单，不再在页面内展示“最近文档”、提取摘要或“查看完整提取原文”入口；如果项目下已存在历史解析快照，也会在本次文档解析成功前先隐藏历史接口信息，避免误用旧结果。
---

最后更新：2026-03-23
