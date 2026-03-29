# 智测平台（当前实际行为）

这是一个前后端一体的测试工作台，前端基于 React + Vite，后端基于 FastAPI + SQLite。当前代码已经包含以下核心能力：

- 质量看板：生产问题分析、测试问题分析
- 功能测试：案例生成入口当前仅提示“敬请期待”、案例质检、分析记录
- 需求分析：需求文档解析、规则维护、历史记录
- 项目与配置管理：项目、代码映射、需求映射、问题文件管理
- 自动化测试：接口自动化首版
- 系统管理：用户管理、操作记录

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
├─ build-package.ps1     # 发布打包脚本（只打源码和必要配置）
├─ package.json          # 前端脚本与依赖
├─ README.md             # 当前说明文档
├─ requirements.txt      # 后端依赖
└─ start-dev.bat         # 启动脚本
```

运行时目录不在仓库内。`start-dev.bat` 默认会在“项目同级目录”创建一个外部目录：

```text
<项目同级>\<项目名>.runtime\
├─ .env                  # 推荐放这里，升级代码时不会被覆盖
├─ data\
│  └─ codetestguard.db   # SQLite 数据库
└─ logs\
   ├─ backend.log
   ├─ backend-console.log
   └─ frontend-console.log
```

## 3. 安装、启动与发布

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

推荐把示例环境变量复制到外部 runtime 目录：

```bash
copy .env.example ..\CodeX.AITest.runtime\.env
```

`start-dev.bat` 的当前实际行为：

- 先读取项目根目录 `.env`
- 再读取项目同级 runtime 目录下的 `.env`
- 如果两边存在同名变量，以 runtime `.env` 为准
- 自动创建项目同级的运行时目录 `<项目名>.runtime`
- 默认把 SQLite 数据库写到项目外部的 `data\codetestguard.db`
- 默认把后端日志和前端/后端控制台输出写到项目外部的 `logs\`
- 前后端都按公司内网当前使用方式绑定到 `0.0.0.0`
- 后端发起 AI 请求时优先使用当前进程中的 `DEEPSEEK_API_KEY`；如果当前进程未设置且运行在 Windows，会回退读取系统环境变量中的同名值
- 如果 `DEEPSEEK_API_KEY` 仍是示例占位值，或请求返回 401 认证失败，页面会显示明确的中文提示，不再直接暴露底层鉴权报错

### 一键启动

```bash
start-dev.bat
```

启动后默认访问地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`
- 健康检查：`http://127.0.0.1:8000/api/health`

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

### 发布打包

不要再直接压缩整个项目目录。请使用仓库根目录的打包脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-package.ps1
```

当前打包脚本行为：

- 只打源码和必要配置：`api/`、`public/`、`sample_files/`、`src/` 以及根目录必要脚本与配置文件
- 自动排除 `node_modules/`、`dist/`、`coverage/`、`.git/`、`__pycache__/`、`.pytest_cache/`
- 自动排除数据库、日志、缓存文件，避免把运行数据打进 zip
- 默认输出到 `release-packages/`

建议发布步骤：

1. 在本地执行 `build-package.ps1` 生成 zip。
2. 上传 zip 到公司内网目标机器。
3. 解压到新的代码目录，不要覆盖现有 runtime 目录。
4. 双击 `start-dev.bat` 启动。
5. 确认新版本正常后，再删除旧代码目录。

## 4. 环境变量

### 后端 `.env`

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `APP_RUNTIME_DIR` | 否 | 运行时根目录；默认使用“项目同级目录\项目名.runtime” |
| `APP_LOG_DIR` | 否 | 日志目录；默认 `APP_RUNTIME_DIR\logs` |
| `DEEPSEEK_API_KEY` | 否 | 需求分析、接口自动化 AI 补全使用；未配置时 AI 相关能力会降级或跳过；不能直接使用示例值 `your-deepseek-api-key` |
| `SESSION_SECRET` | 是 | 登录会话签名密钥 |
| `INITIAL_ADMIN_USERNAME` | 是 | 首次初始化管理员账号 |
| `INITIAL_ADMIN_PASSWORD` | 是 | 首次初始化管理员密码 |
| `INITIAL_ADMIN_DISPLAY_NAME` | 否 | 首次初始化管理员显示名 |
| `DB_PATH` | 否 | SQLite 文件路径；默认 `APP_RUNTIME_DIR\data\codetestguard.db` |
| `CORS_ALLOW_ORIGINS` | 否 | 允许的跨域来源，逗号分隔 |
| `SESSION_COOKIE_SECURE` | 否 | Cookie 是否仅限 HTTPS |
| `SESSION_COOKIE_SAMESITE` | 否 | Cookie SameSite 策略 |
| `EXTERNAL_AUTH_URL` | 否 | 公司内部账号认证接口地址；配置后登录会在本地账号失败时回退调用该接口 |
| `EXTERNAL_AUTH_TIMEOUT_MS` | 否 | 公司内部账号认证接口超时，单位毫秒，默认 `10000` |

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
| 功能测试 | 案例生成 | 点击仅提示“敬请期待”，不跳转 |
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
| 系统管理 | 操作记录 | 仅管理员可见，路由 `/operation-logs` |

### 当前受保护路由

- `/`
- `/functional-testing/case-generation`
- `/functional-testing/case-quality`
- `/functional-testing/records`
- `/functional-testing/records/:id`
- `/automation-testing/api`
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
- `/operation-logs`

### 当前公开路由

- `/login`

说明：

- 侧边栏默认展开，并自动展开当前路由所在的一级菜单。
- 根路由 `/` 与未命中路由默认重定向到 `/functional-testing/case-quality`。
- `/functional-testing/case-generation` 路由仍可直接访问，但侧边栏入口当前按“敬请期待”处理。
- `/requirement-analysis`、`/requirement-analysis/history`、`/history` 当前存在路由，但不在侧边栏直接暴露。
- 未登录访问受保护路由会被拦截。

## 6. 接口自动化首版

### 页面入口

- 前端路由：`/automation-testing/api`
- 侧边栏位置：`自动化测试 > 接口自动化`

### 当前实际流程

1. 选择项目，并加载该项目最近一次接口自动化上下文。
2. 配置单项目单活动环境。
3. 上传接口文档；只有本次文档解析成功后才展示当前接口清单，历史接口信息在解析成功前不会显示。
4. 生成、编辑并保存接口测试案例。
5. 执行用例、查看报告、查看历史、重新执行、下载 JSON 报告。

### 当前支持的文档类型

- PDF
- Word：`.doc` / `.docx`
- OpenAPI 3.x：`.json` / `.yaml` / `.yml`

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

### 当前案例与执行能力

- 规则生成基础案例
- AI 补全案例、断言、依赖和提取规则
- AI 补全超时或失败时，会自动回退为规则生成案例
- 支持 `{{env.xxx}}` 和 `{{runtime.xxx}}` 变量替换
- 执行前自动保存当前编辑稿
- 当前执行器按依赖顺序串行执行
- 当前报告支持页面查看和下载 JSON

### 当前持久化表

- `api_test_environment_configs`
- `api_document_records`
- `api_test_suites`
- `api_test_runs`
- `api_test_run_items`

## 7. 主要后端接口

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

当前登录行为：

- 同时支持系统本地账号与公司内部账号。
- 当 `EXTERNAL_AUTH_URL` 已配置时，后端会在本地账号校验失败后回退调用公司认证接口。
- 公司内部账号登录成功后，后端会自动创建或同步一条本地用户记录，并继续沿用当前 Session Cookie 机制。
- 登录页当前仅展示标题、副标题、用户名/密码输入框与登录按钮，不再展示会话有效期、账号创建来源或自助注册帮助提示。

### 操作记录

- `GET /api/audit-logs`
- 页面顶部当前仅展示“操作记录”标题，不再显示额外说明文案和提示卡片。
- 列表中的“账号”列当前展示实际登录账号（优先使用操作人的 `operator_username`），不再复用项目名等目标对象名称。
- “说明”列当前会按操作类型压缩为短文案，例如“登录成功”“分析完成”“报告生成”，避免展示冗长描述。
- 搜索框支持按操作人、账号、文件名、说明或接口路径筛选。
- 当前会记录登录/登出、用户管理、部分项目与文件管理操作，以及“案例分析”“生成案例质检报告”等功能测试链路操作。

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
- 代码映射明细列表当前会固定右侧“操作”列；“功能描述”和“测试点”超长内容按两行省略展示，鼠标悬浮可查看完整内容，避免与操作列重叠。

### 需求分析与需求映射

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
- 项目案例分析成功后会新增一条“功能测试 / 案例分析”审计日志，记录项目、分析记录 ID、上传文件名和是否启用 AI。
- 生成案例质检综合报告成功后会新增一条“功能测试 / 生成案例质检报告”审计日志，记录项目、需求分析记录 ID、案例分析记录 ID 和关联文件名。

### 生产 / 测试问题文件

- `POST /api/issue-analysis/import`
- `POST /api/defect-analysis/import`
- `GET /api/production-issue-files`
- `POST /api/production-issue-files`
- `GET /api/production-issue-files/{file_id}/analysis`
- `GET /api/test-issue-files`
- `POST /api/test-issue-files`
- `GET /api/test-issue-files/{file_id}/analysis`

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

## 8. 验证命令

当前建议验证命令：

```bash
npm run build
python -m pytest api/tests/test_database.py -q
python -m pytest api/tests/test_api_automation_api.py -q
```

## 9. 当前注意事项

- 界面文案默认使用中文。
- 不要把项目同级的 runtime 目录一起打包发布；数据库、日志和外部 `.env` 都应该长期保留在该目录。
- 当前发布方式应改为“新代码目录 + 复用同一个 runtime 目录”，不要覆盖式解压。
- 接口自动化当前是“单项目单活动环境”，不支持环境矩阵。
- 当前报告下载格式只有 JSON。
- 当前“预期数据库校验”列只是备注，不会真的连库执行 SQL 校验。
- 当前执行是同步串行执行，没有 WebSocket 实时流式进度。
- 当前不支持客户端证书、浏览器 SSO、验证码、人机校验、复杂代理链。

最后更新：2026-03-29
