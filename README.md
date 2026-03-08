# 智测平台

智测平台是一个面向测试团队的前后端一体化分析平台，当前覆盖 3 条主链路：

- 数据看板：对生产问题、测试问题做导入分析和统计归纳
- 需求分析：上传需求文档，结合历史生产问题和项目测试问题识别风险点
- 案例分析：基于代码变更、测试用例和映射关系做覆盖与质量分析

当前品牌图统一使用 `public/cpic-mark.png`，登录页、系统内导航和浏览器标签页图标保持一致。
- 页面标题区说明文案已移除，仅保留必要的业务提示、告警和统计信息。

## 1. 当前菜单与路由

当前左侧菜单顺序如下：

| 一级菜单 | 二级菜单 | 路由 | 说明 |
| --- | --- | --- | --- |
| 数据看板 | 生产问题分析 | `/issue-analysis` | 基于生产问题文件生成阶段、标签、原因、整改方向等统计看板 |
| 数据看板 | 测试问题分析 | `/defect-analysis` | 基于项目绑定的测试问题文件生成严重度、来源、原因、摘要等统计看板 |
| 需求分析 | 需求分析 | `/requirement-analysis` | 选择项目并上传 `.docx` 需求文档，自动关联全局生产问题与项目测试问题，并输出风险矩阵、注意点和测试建议 |
| 需求分析 | 分析记录 | `/requirement-analysis/history` | 查看需求分析历史记录与结果快照 |
| 需求分析 | 过滤规则 | `/requirement-analysis/rules` | 在统一规则列表中维护默认规则、忽略词和白名单，减少“按钮/点击/数字/阿拉伯数字”等弱命中误报 |
| 案例分析 | 案例分析 | `/` | 上传代码变更 JSON 与测试用例 CSV/Excel，结合映射关系评估覆盖情况和质量 |
| 案例分析 | 分析记录 | `/history` | 查看案例分析历史记录和详情 |
| 项目管理 | 项目列表 | `/project-management` | 维护项目基础信息 |
| 文件管理 | 生产问题 | `/production-issues` | 上传并维护全局生产问题文件 |
| 文件管理 | 测试问题 | `/test-issues` | 上传并维护项目级测试问题文件 |
| 文件管理 | 代码映射关系 | `/projects` | 维护项目与代码映射关系、查看项目详情 |
| 系统管理 | 用户管理 | `/users` | 仅管理员可见，维护用户账号、状态与密码 |

## 2. 核心能力概览

### 2.1 数据看板

- 生产问题分析直接读取已上传的生产问题文件
- 测试问题分析按项目读取对应的测试问题文件
- 输出图表、Top 热点、归纳结论和明细预览

### 2.2 需求分析

需求分析是当前新增的一条独立能力链路，当前交互与规则如下：

- 前端流程：选择项目 → 上传需求文档 → 执行分析
- 页面不再要求手工选择生产问题文件和测试问题文件
- 首版仅支持 `.docx`
- 后端自动选取：
  - 最新的全局生产问题文件
  - 所选项目下最新的测试问题文件
- 文档解析优先提取 `4.1` 和 `4.4` 章节
- 若目标章节缺失，则回退到全文正文
- 只命中文档正文内容，不命中标题、字段名、表头等噪声文本
- 规则引擎负责判定“是否命中”
- DeepSeek 负责补充总体结论、关键关注点、风险等级矩阵、生产问题注意点和测试建议
- 分析成功后，页面会自动滚动到结果区域
- 支持在 `需求分析 / 过滤规则` 中统一维护默认规则、忽略词和白名单，并按规则词模糊搜索
- 默认规则首版会预置“按钮、点击、数字、阿拉伯数字、不可编辑”等弱信号词，且支持直接修改和删除
- 系统已统一优化复合输入框样式，搜索框、带前缀图标输入框等场景不再出现内外双层边框

当前结果页主要包含：

- 概览统计卡片
- AI 智能结论
- 风险等级矩阵（优先展示 AI 结果，缺失时回退规则估算）
- 生产问题注意点（精简表格）
- 测试建议（精简表格）
- 逐条命中明细（仅保留命中证据，不展示需求正文）
- 未命中需求点
- AI token、成本、耗时

历史记录独立保存在需求分析自己的记录表中，不与案例分析历史混用。

### 2.3 案例分析

- 上传代码变更 JSON
- 上传测试用例 CSV/Excel
- 读取项目映射关系
- 计算覆盖情况、评分结果与 AI 补充建议
- 历史记录保存到案例分析专用记录表

### 2.4 文件管理

- 生产问题页和测试问题页当前统一为“列表主视图 + 上传弹窗”的交互样式
- 生产问题支持直接上传全局台账，最新文件会作为生产问题分析与需求分析的默认来源
- 测试问题仍按项目维度上传和替换

## 3. DeepSeek 复用说明

需求分析和案例分析复用同一套 DeepSeek 能力：

- 同一个配置项：`DEEPSEEK_API_KEY`
- 同一个模型：`deepseek-chat`
- 同一套 token 统计与成本口径
- 同一套客户端：`api/services/deepseek_client.py`

当前后端会按以下顺序读取 `DEEPSEEK_API_KEY`：

1. 当前进程环境变量
2. Windows 环境注册表中的用户/机器级环境变量

因此在 Windows 本机已配置系统环境变量时，即使启动进程未显式继承，也会尝试回退读取。

## 4. 技术栈

### 前端

- React 19
- TypeScript
- Vite
- Ant Design 6
- TanStack Query
- ECharts
- Axios
- Vitest + Testing Library

### 后端

- FastAPI
- Python 3.11+
- SQLite
- OpenPyXL
- Python-Docx
- Javalang
- Loguru
- Pydantic

## 5. 目录结构

```text
CodeX.AITest/
├─ src/
│  ├─ components/             # 通用组件、布局、结果展示
│  ├─ pages/                  # 页面级组件
│  ├─ types/                  # 前端类型定义
│  ├─ utils/api.ts            # 前端 API 封装
│  ├─ auth/                   # 登录态与路由守卫
│  └─ App.tsx                 # 前端路由入口
├─ public/                    # 静态资源与品牌图
├─ api/
│  ├─ index.py                # FastAPI 入口与接口定义
│  ├─ services/               # 分析、解析、数据库服务
│  ├─ tests/                  # 后端测试
│  └─ data/                   # SQLite 数据
├─ sample_files/              # 示例文件
├─ requirements.txt           # 后端依赖
├─ package.json               # 前端依赖与脚本
├─ AGENTS.md                  # 仓库级协作规则
└─ README.md                  # 项目说明
```

## 6. 关键模块与文件

### 6.1 需求分析

- 前端页面：
  - `src/pages/RequirementAnalysis.tsx`
  - `src/pages/RequirementAnalysisHistory.tsx`
  - `src/pages/RequirementAnalysisRules.tsx`
  - `src/components/RequirementAnalysis/RequirementAnalysisResult.tsx`
- 前端类型与接口：
  - `src/types/index.ts`
  - `src/utils/api.ts`
- 后端接口：
  - `POST /api/requirement-analysis/analyze`
  - `GET /api/requirement-analysis/records`
  - `GET /api/requirement-analysis/records/{record_id}`
  - `GET /api/requirement-analysis/rules`
  - `POST /api/requirement-analysis/rules`
  - `PUT /api/requirement-analysis/rules/{rule_id}`
  - `DELETE /api/requirement-analysis/rules/{rule_id}`
- 后端服务：
  - `api/services/requirement_document_parser.py`
  - `api/services/requirement_analysis.py`
  - `api/services/deepseek_client.py`
  - `api/services/database.py`

### 6.2 数据看板

- 页面：
  - `src/pages/IssueAnalysis.tsx`
  - `src/pages/DefectAnalysis.tsx`
- 服务：
  - `api/services/issue_analysis.py`
  - `api/services/defect_analysis.py`

### 6.3 案例分析

- 页面：
  - `src/pages/Upload.tsx`
  - `src/pages/History.tsx`
- 服务：
  - `api/services/diff_analyzer.py`
  - `api/services/ast_parser.py`
  - `api/services/coverage_analyzer.py`
  - `api/services/scoring_model.py`
  - `api/services/deepseek_client.py`

### 6.4 导航、品牌与登录

- `index.html`
- `src/components/Layout/AppLayout.tsx`
- `src/index.css`
- `src/pages/Login.tsx`
- `src/pages/Login.css`
- `public/cpic-mark.png`

## 7. API 概览

### 7.1 通用与项目

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `PUT /api/projects/{project_id}`
- `DELETE /api/projects/{project_id}`

### 7.2 数据文件

- `GET /api/production-issue-files`
- `POST /api/production-issue-files`
- `GET /api/production-issue-files/{file_id}/analysis`
- `GET /api/test-issue-files`
- `POST /api/test-issue-files`
- `GET /api/test-issue-files/{file_id}/analysis`

### 7.3 需求分析

- `POST /api/requirement-analysis/analyze`
- `GET /api/requirement-analysis/records`
- `GET /api/requirement-analysis/records/{record_id}`
- `GET /api/requirement-analysis/rules`
- `POST /api/requirement-analysis/rules`
- `PUT /api/requirement-analysis/rules/{rule_id}`
- `DELETE /api/requirement-analysis/rules/{rule_id}`

### 7.4 案例分析

- `POST /api/projects/{project_id}/analyze`
- `GET /api/records`
- `GET /api/records/{record_id}`

### 7.5 系统管理

- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/{user_id}`
- `PUT /api/users/{user_id}/status`
- `PUT /api/users/{user_id}/password`

## 8. 本地开发

### 8.1 安装依赖

```bash
npm install
python -m pip install -r requirements.txt
```

### 8.2 分别启动前后端

```bash
# 终端 1：前端
npm run dev

# 终端 2：后端
cd api
python -m uvicorn index:app --reload --host 127.0.0.1 --port 8000
```

前端开发服务器默认运行在 `http://127.0.0.1:5173`，并通过 Vite 代理把 `/api` 请求转发到 `http://127.0.0.1:8000`。

### 8.3 Windows 一键启动

```bash
copy .env.example .env
start-dev.bat
```

`start-dev.bat` 会自动：

- 检查 `python`、`npm`、`package.json` 和 `api/index.py`
- 读取根目录 `.env`
- 分别拉起前端开发服务和后端 FastAPI 服务
- 提示 `5173` 与 `8000` 端口占用情况

### 8.4 环境变量

- `DEEPSEEK_API_KEY`：DeepSeek 调用凭证，必填
- `SESSION_SECRET`：登录会话签名密钥；当数据库里还没有任何用户时必填
- `INITIAL_ADMIN_USERNAME`：首次初始化管理员账号时使用
- `INITIAL_ADMIN_PASSWORD`：首次初始化管理员密码时使用
- `INITIAL_ADMIN_DISPLAY_NAME`：首次初始化管理员显示名，默认 `系统管理员`
- `DB_PATH`：可选，自定义 SQLite 文件路径；默认使用 `api/data/codetestguard.db`
- `VITE_API_URL`：可选，自定义前端请求的 API 根地址；未设置时默认走 `/api`
- `CORS_ALLOW_ORIGINS`：可选，覆盖允许跨域的前端地址，多个地址用英文逗号分隔
- `SESSION_COOKIE_SECURE`：可选，设为 `true/1/yes` 时仅通过 HTTPS 发送 Cookie
- `SESSION_COOKIE_SAMESITE`：可选，默认 `lax`

### 8.5 数据库说明

- 如果直接保留并复制 `api/data/codetestguard.db`，项目、分析记录、用户与会话记录会一并带过去；但浏览器 Cookie 不会随压缩包迁移，所以到新电脑后通常仍需重新登录
- 如果删除数据库文件，或把 `DB_PATH` 指向一个新的空库，后端首次启动时会要求先配置 `SESSION_SECRET`、`INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD`
- 不建议把本地运行产生的用户、会话或分析数据直接提交到 Git 仓库

## 9. 测试与构建

### 前端

```bash
npm test
npm run build
```

### 后端

```bash
cd api
python -m pytest -q
```

最近已重点验证过的链路包括：

- `src/pages/RequirementAnalysis.test.tsx`
- `src/components/Layout/AppLayout.test.tsx`
- `api/tests/test_requirement_analysis_api.py`
- `api/tests/test_deepseek_client.py`

## 10. 常见改动入口

### 新增或调整菜单/路由

- `src/components/Layout/AppLayout.tsx`
- `src/App.tsx`

### 修改需求分析

- `src/pages/RequirementAnalysis.tsx`
- `src/pages/RequirementAnalysisHistory.tsx`
- `src/components/RequirementAnalysis/RequirementAnalysisResult.tsx`
- `src/utils/api.ts`
- `src/types/index.ts`
- `api/index.py`
- `api/services/requirement_document_parser.py`
- `api/services/requirement_analysis.py`
- `api/services/database.py`

### 修改案例分析

- `src/pages/Upload.tsx`
- `src/pages/History.tsx`
- `api/services/coverage_analyzer.py`
- `api/services/scoring_model.py`
- `api/services/deepseek_client.py`

### 修改品牌图、登录页或侧边栏

- `src/components/Layout/AppLayout.tsx`
- `src/index.css`
- `src/pages/Login.tsx`
- `src/pages/Login.css`
- `public/cpic-mark.png`

## 11. 维护约定

- 每次新增、删除或修改功能后，必须同步更新 `README.md`
- README 应记录当前真实菜单、路由、接口、依赖和使用流程
- 如果代码与文档冲突，以修正文档为必做项，不要把过期描述继续留在仓库里

---

最后更新：2026-03-08
