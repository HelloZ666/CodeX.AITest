# 智测平台

当前仓库是一个前后端一体化的测试工作台，前端基于 React + Vite，后端基于 FastAPI + SQLite。

当前实际已实现的能力包括：

- 质量看板：仅管理员可见的效能分析（支持上传寿险/健康险效能工作簿生成看板）、质量分析（生产问题分析、测试问题分析）
- 功能测试：案例生成（含复用模板、大纲编辑、已保存案例列表、AI 推理强度深度/均衡/快速切换）、案例质检（支持 AI 推理强度深度/均衡/快速切换）、分析记录、记录详情
- 需求分析：需求文档解析、需求映射、过滤规则、历史记录
- 接口自动化：接口文档解析、用例生成、用例编辑、执行、报告、重跑
- AI 辅助工具：AI 助手问答，支持附件分析、多轮对话与上下文续聊
- 项目管理：项目列表中的新建、编辑、删除仅管理员可操作；普通用户仅可查看自己所属项目，项目描述、测试经理、测试人员仍由管理员维护，其中测试经理和测试人员均为系统管理中的 P13 用户多选
- 项目权限：除管理员外，测试问题分析、案例生成、案例质检、接口自动化、系统功能全景图、测试需求、测试案例、需求映射关系、代码映射关系等所有项目相关页面与接口，仅展示当前登录用户所属项目及其关联数据；后续新增项目相关页面也沿用同一可见性规则
- 配置管理：生产问题、测试问题、需求文档、测试用例、提示词管理（仅管理员可见）、需求映射关系、代码映射关系
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
- simple-mind-map
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
- 脚本会自动跳过 Windows 的 `AppData\Local\Microsoft\WindowsApps\python.exe` 占位别名，并优先尝试真实安装路径；若公司环境仍无法识别 Python，可在项目同级 `CodeX.AITest.runtime\.env` 中显式设置 `PYTHON_CMD=你的 python.exe 绝对路径` 后重新执行 `start-dev.bat --check`

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
| 质量看板 | 效能分析 | - | 仅管理员可见，路由 `/performance-analysis`；上传寿险/健康险效能工作簿后，页面默认展示最新一次导入数据，并通过级联筛选在 `历年数据-寿险`、`历年数据-健康险`、`当年数据-寿险-月份`、`当年数据-健康险-月份` 间切换。 |
| 质量看板 | 质量分析 | 生产问题分析 | 复用现有页面，路由 `/issue-analysis` |
| 质量看板 | 质量分析 | 测试问题分析 | 复用现有页面，路由 `/defect-analysis` |
| 功能测试 | 案例生成 | - | 路由 `/functional-testing/case-generation`；支持选择项目、配置是否复用系统功能全景图大纲模板、选择提示词与 AI 推理强度，其中推理强度入口位于工作台头部右侧的 AI 生成设置卡片；上传需求文档后自动完成需求映射，先生成可编辑思维导图大纲，画布支持拖拽移动、滚轮缩放和工具栏缩放/适应，保存大纲后再生成最终测试用例预览；生成大纲时在当前步骤卡片内展示带阶段节点的粒子加载动画，预览区可查看“需求映射”详情并手动保存案例，页面下方展示已保存案例列表；推理强度默认“均衡”，切换到“深度 / 快速”时会额外调整内网大模型请求参数 |
| 功能测试 | 案例质检 | - | 路由 `/functional-testing/case-quality`；工作台头部右侧提供 AI 测试建议卡片，支持按页面切换 AI 开关与 AI 推理强度，卡片内不再展示额外说明文案；推理强度默认“均衡”，切换到“深度 / 快速”时会额外调整案例质检相关内网大模型请求参数 |
| 功能测试 | 分析记录 | - | 路由 `/functional-testing/records` |
| 自动化测试 | UI 自动化 | - | 占位入口 |
| 自动化测试 | 接口自动化 | - | 路由 `/automation-testing/api` |
| 性能测试 | 压测场景 / 脚本生成 / 脚本执行 / 性能调优 | - | 均为占位入口 |
| AI 辅助工具 | AI 助手 | - | 路由 `/ai-tools/agents` |
| AI 辅助工具 | PDF 核对 / 数据生成 / 回归验证 / 端到端测试 | - | 均为占位入口 |
| 项目管理 | 项目列表 | - | 路由 `/project-management`；管理员可新建、编辑、删除项目，并维护项目描述、测试经理、测试人员，后两者为系统管理中的 P13 用户多选；普通用户仅查看自己所属项目；新增与编辑弹窗中的成员选择框使用中文标签与占位文案 |
| 知识库管理 | 系统功能全景图 | - | 路由 `/knowledge-base/system-overview`；列表仅展示已创建的大纲记录，页头仅展示标题和统计标签，项目名称后展示大纲标题、大纲类别和说明，字段还包含创建人、创建时间、最近更新、来源与操作；支持“新建大纲”“大纲”“导入”“编辑”“删除”，新建时可选择任意项目，同一项目允许维护多份大纲，大纲类别可选“功能视图”“通用模板”且默认“功能视图”，导入支持 `.xmind`、`.md`、`.markdown`；编辑页工具栏集中展示返回列表、导入文件、下载大纲、保存大纲与默认开启的 30 秒自动保存开关，下载支持 `.md`、PDF、`.xmind` 与 PNG 图片，画布相关操作整合为“节点操作”“用例类型”“用例等级”“历史操作”“视图”下拉菜单；保存时会软校验至少存在一条反向分支、每个分支末级节点都有预期结果标签，校验不通过仍保存并提示，缺少预期结果的末级节点会标红；页面全屏会临时收起左侧导航栏，并以收起后导航栏右侧区域作为全屏画布区域 |
| 知识库管理 | 测试需求 | - | 路由 `/knowledge-base/test-requirements`；汇总功能测试相关页面提交过的需求文档，按文档内容去重展示最近一次操作人、账号、时间与来源页面 |
| 知识库管理 | 测试案例 | - | 路由 `/knowledge-base/test-cases`；汇总功能测试上传和自动生成的测试用例，按规范化用例内容去重展示最近一次操作人、账号、时间与来源页面，并支持预览与导出 |
| 知识库管理 | 业务规则 | - | 占位入口 |
| 知识库管理 | 通用案例模板 | - | 占位入口 |
| 配置管理 | 生产问题 | - | 路由 `/production-issues` |
| 配置管理 | 测试问题 | - | 路由 `/test-issues` |
| 配置管理 | 需求文档 | - | 路由 `/config-management/requirement-documents`；汇总功能测试相关页面提交过的需求文档，按文档内容去重展示最近一次操作人、账号、时间与来源页面 |
| 配置管理 | 测试用例 | - | 路由 `/config-management/test-cases`；汇总功能测试上传和自动生成的测试用例，按规范化用例内容去重展示最近一次操作人、账号、时间与来源页面，并支持预览与导出 |
| 配置管理 | 提示词管理 | - | 仅管理员可见，路由 `/config-management/prompt-templates` |
| 配置管理 | 需求映射关系 | - | 路由 `/requirement-mappings` |
| 配置管理 | 代码映射关系 | - | 路由 `/projects` |
| 系统管理 | 用户管理 | - | 管理员可见，路由 `/users` |
| 系统管理 | 操作记录 | - | 管理员可见，路由 `/operation-logs`；列表会自动将历史英文值与乱码旧值归一化为中文后展示 |

### 已启用路由

- `/login`
- `/`
- `/functional-testing/case-generation` 已接入侧边栏菜单，用于按需求文档生成可编辑大纲并产出功能测试用例；生成大纲过程中会在当前步骤卡片内显示带阶段节点的粒子加载动画，并在页面下方展示已保存的测试案例记录；记录列表支持通过“预览”“导出”按钮查看和导出案例
- `/functional-testing/test-cases` 作为旧地址兼容保留，访问后会重定向到 `/functional-testing/case-generation`
- `/functional-testing/case-quality`
- `/functional-testing/records`
- `/functional-testing/records/:id`
- `/automation-testing/api`
- `/ai-tools/agents`
- `/performance-analysis`（仅管理员可见）
- `/issue-analysis`
- `/defect-analysis`
- `/requirement-analysis`
- `/requirement-analysis/history`
- `/knowledge-base/system-overview` 用于维护项目级系统功能全景图列表
- `/knowledge-base/system-overview/:overviewId` 用于进入思维导图画布编辑指定项目大纲
- `/knowledge-base/test-requirements`
- `/knowledge-base/test-cases`
- `/knowledge-base/business-rules`
- `/knowledge-base/common-case-templates`
- `/project-management`
- `/production-issues`

### 系统功能全景图

- 列表页路由为 `/knowledge-base/system-overview`，侧边栏“知识库管理 > 系统功能全景图”可直达
- 列表页头部仅显示“系统功能全景图”标题和统计标签，不再显示顶部小标签与说明文案
- 列表只展示已创建的大纲记录，不会把未创建大纲的项目混入台账
- 列表在“项目名称”后展示“大纲标题”“大纲类别”“说明”三列；大纲类别枚举为“功能视图”“通用模板”
- “新建大纲”弹窗可选择任意项目，同一个项目下允许创建多份大纲；创建时大纲类别默认“功能视图”，创建后默认生成一份可编辑的思维导图数据骨架
- “编辑”弹窗支持调整大纲标题、大纲类别和说明
- 操作列包含“大纲”“导入”“编辑”“删除”
- “大纲”进入画布编辑页 `/knowledge-base/system-overview/:overviewId`
- 编辑页基于 `simple-mind-map` 提供浏览器内思维导图画布，支持鼠标左键拖动画布、双击节点编辑文本、插入子节点、插入同级节点、删除节点、撤销、重做、页面全屏、手动保存与自动保存
- 编辑页工具栏按“返回列表”“导入文件”“下载大纲”“保存大纲”“节点操作”“用例类型”“用例等级”“历史操作”“视图”“自动保存”展示；“下载大纲”支持导出 `.md`、PDF、`.xmind` 与 PNG 图片；自动保存控件位于最后，默认开启并每 30 秒保存一次未保存修改，可切换为 15 秒、30 秒、1 分钟、2 分钟，也可手动关闭；画布相关按钮整合为“节点操作”“用例类型”“用例等级”“历史操作”“视图”五个下拉菜单
- “节点操作”包含“子节点”“同级节点”“删除节点”，“历史操作”包含“撤销”“重做”，“视图”包含“页面全屏 / 退出页面全屏”
- 画布末级节点默认带“正向”用例类型和“一般”用例等级，但思维导图中默认隐藏“正向”“一般”两个标签，仅展示反向、核心/重要、优先级、自定义标签和预期结果等需要区分的信息；可通过工具栏“用例类型”下拉菜单或右键菜单标记“正向”“反向”“预期结果”，“正向”和“反向”互斥
- 可通过工具栏“用例等级”下拉菜单标记“核心”“重要”“一般”，默认等级为“一般”
- 节点标记用例等级或用例类型后会自动计算优先级：核心 + 正向为 `P0`；核心 + 反向、重要 + 正向为 `P1`；一般 + 正向、重要 + 反向为 `P2`；一般 + 反向为 `P3`
- 对已经带有标签或用例等级的末级节点新增子节点时，原节点标签会在新增动作完成后立即转移并显示到新子节点上，原节点转为分组节点后不再保留这些叶子用例标签
- 末级节点标记“预期结果”后，会自动补充“用例描述：验证XXX功能”标签，其中 `XXX` 为该末级节点文本；同级末级节点可分别标记预期结果
- 保存大纲时会校验至少存在一条带“反向”标签的分支，并校验每个分支的最后一个节点都带“预期结果”标签；校验不通过不会阻断保存，手动保存会给出提示，缺少预期结果的末级节点会在画布中标红
- 节点双击编辑时，输入框会直接挂载到 `document.body` 并按节点当前屏幕坐标定位，避免因页面容器坐标系干扰而出现编辑框悬浮到其他位置
- 画布保存时会把组件回传的根节点快照标准化为完整导图结构，重新进入大纲页后会继续回显已保存的分支节点，不会只剩主节点
- 编辑页初始化会优先使用最新接口数据完成画布实例化，不会因为异步加载时序误用默认骨架并在首次保存时覆盖掉已有分支
- 首次进入编辑页、切换页面全屏时，画布会自动按当前大纲重新居中并放大到更易读的比例，避免内容缩得过小或看起来没有落在可视区域
- 编辑页支持 `Ctrl+S` / `Cmd+S` 快捷保存，会优先读取当前画布实例的最新快照再落库；自动保存复用同一快照保存逻辑，避免 React 状态尚未同步完成时把旧的脑图数据写回后端
- 保存大纲时仅持久化节点结构、布局与主题，不持久化当前画布平移/缩放视图；保存成功后会更新本地查询缓存，不重新拉取并重置当前画布，避免新增或编辑节点后出现闪烁式刷新
- 页面全屏为浏览器页面内覆盖模式，不调用系统级全屏；进入页面全屏时左侧导航栏会临时收起，画布全屏区域从收起后导航栏右侧开始，退出页面全屏后恢复进入前的导航栏状态，且全屏后仍可继续双击编辑节点
- 在画布中右键节点会弹出快捷菜单，可直接执行“添加子节点”“添加同级节点”“删除节点”“撤销”“重做”等常用操作
- 导入支持 `.xmind`、`.md`、`.markdown`，导入后先加载到画布或直接回写记录，保存后覆盖当前大纲记录
- 后端接口为：
  - `GET /api/knowledge-base/system-overviews`
  - `POST /api/knowledge-base/system-overviews`：创建项目大纲，支持 `project_id`、`title`、`outline_category`、`description`
  - `GET /api/knowledge-base/system-overviews/{overview_id}`
  - `PUT /api/knowledge-base/system-overviews/{overview_id}`：更新标题、类别、说明、导图数据和导入来源信息
  - `DELETE /api/knowledge-base/system-overviews/{overview_id}`
- `/test-issues`
- `/config-management/requirement-documents`
- `/config-management/test-cases`
- `/config-management/prompt-templates`（仅管理员可见）
- `/requirement-mappings`
- `/projects`
- `/project/:id`
- `/history`
- `/users`
- `/operation-logs`

说明：

- 根路由 `/` 默认重定向到 `/functional-testing/case-quality`
- `/functional-testing/case-generation` 已接入侧边栏菜单，用于按需求文档生成可编辑大纲并产出功能测试用例，并在页面下方展示已保存的测试案例记录；记录列表支持通过“预览”“导出”按钮查看和导出案例
- `/functional-testing/test-cases` 作为旧地址兼容保留，访问后会重定向到 `/functional-testing/case-generation`
- `/operation-logs` 仅管理员可访问；操作记录列表会自动规范“模块 / 操作 / 说明”列中的历史英文值与乱码旧值，统一显示为中文。
- `/config-management/requirement-documents` 用于查看功能测试相关页面沉淀的去重需求文档台账
- `/config-management/test-cases` 用于查看功能测试上传或自动生成后沉淀的去重测试用例台账
- `/config-management/prompt-templates` 仅管理员可访问，用于维护提示词；其他已登录业务页仍可读取提示词列表并选择使用
- `/performance-analysis` 仅管理员可访问，默认展示最新一次导入的工作簿数据；页面使用级联筛选在 `历年数据-寿险`、`历年数据-健康险`、`当年数据-寿险-月份`、`当年数据-健康险-月份` 间切换，不再提供历史文件版本切换框
- `/requirement-analysis`、`/requirement-analysis/history`、`/history` 当前不直接暴露在侧边栏
- 除管理员外，`/defect-analysis`、`/functional-testing/case-generation`、`/functional-testing/case-quality`、`/automation-testing/api`、`/knowledge-base/system-overview`、`/knowledge-base/test-requirements`、`/knowledge-base/test-cases`、`/config-management/requirement-documents`、`/config-management/test-cases`、`/requirement-mappings`、`/projects` 等项目相关入口，只显示当前登录用户所属项目及其关联记录；后续新增项目相关页面也应沿用同一规则
- 除 `/login` 外，其余页面均受登录保护

## 页面实际行为

### 效能分析

- 页面路由为 `/performance-analysis`，位于“质量看板 > 效能分析”，并沿用管理员权限控制
- 页面支持上传 `.xlsx / .xls` 格式的完整寿险/健康险效能分析工作簿；上传后会保存原始文件、工作表数量和上传时间，页面默认始终展示最新一次导入的数据
- 页面仅解析 8 张业务表：历年模式以 `寿险汇总数据-历年数据` 与 `健康险汇总数据-历年数据` 为源，当年模式以寿险/健康险各 3 张当前年表为源（其它 sheet 统统忽略），当前年由这 6 张表中的最大年份决定
- 页面提供级联筛选，默认选中 `当年数据 / 寿险 / 最新月份`；可切换路径为 `历年数据 / 寿险`、`历年数据 / 健康险`、`当年数据 / 寿险 / 月份`、`当年数据 / 健康险 / 月份`，当年模式下只展示当前业务线实际有数据的月份，月份标签统一显示为 `YYYY年M月`
- 当年模式下，团队月度表支持在月份块之间穿插备注/说明行；即使 `1月` 与 `2月` 之间存在备注行，后续月份的团队图表与团队明细也会继续正常展示，不会被误判为“无数据”
- 历年模式仅展示年度平均与人均汇总，不渲染团队、自动化、精准测试图表；其中 `历年汇总明细` 与 `历年人均指标` 仍按上传文件中的原始表头和原始行值回显，但会自动剔除合并单元格带出的空白列；`历年人均指标` 中的数值统一保留 2 位小数，缺陷率按百分比显示；当年模式展示所选月份的汇总、团队图表与团队明细表，不再显示“自动化与线上质量”卡片，其中顶部 KPI 第 3 项显示“所选月测试缺陷数”，趋势图、团队图和团队明细中的缺陷率继续按百分比显示，缺失的模块会显示空态说明
- 所有带“缺陷率”的效能分析图表在坐标轴、悬浮提示和相关表格中都按百分比显示，不再回显原始小数值
- “团队任务密度与缺陷率”图会为左右两侧 y 轴标题额外预留边距，保证“人均任务”和“缺陷率”完整显示
- 历年模式的 KPI 第 3 项显示“最新历年缺陷数”，取值来自 `历年汇总明细` 中的缺陷列，兼容 `缺陷数` 与 `缺陷数 除性能、代码扫描外所有任务类型（SIT+FT）` 表头；`历年任务规模对比` 与 `历年人均趋势` 在桌面端同一行等宽展示，图表高度保持一致
- 上传弹窗会明确提示建议上传完整工作簿；上传成功后，页面会自动展示本次新导入的数据并刷新当前看板
- 当前样式已按“数据看板”视觉方向实现浅色大卡片、顶部筛选工具栏、图表卡片和团队明细区

### 提示词管理

- 页面路由为 `/config-management/prompt-templates`，位于“配置管理 > 提示词管理”，仅管理员可见
- 页面显示提示词列表，不直接在表格中展示提示词内容
- 更新时间按浏览器本地时间格式展示，不直接显示接口返回的 ISO 时间字符串
- 点击“详情”后，通过弹窗展示完整提示词
- 支持新增、编辑、删除提示词
- 新增或编辑提示词保存成功后，编辑弹窗会自动关闭
- 配置管理 > 提示词管理中的提示词会复用于功能测试案例生成、需求分析、案例分析、接口自动化文档解析、接口自动化用例生成等结构化 AI 场景；案例质检页当前提供 AI 开关，但不提供提示词选择，开启时走系统默认提示词
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

### 配置管理 > 需求文档

- 页面路由为 `/config-management/requirement-documents`
- 列表字段包含需求文档名称、类型、文件大小、项目、来源页面、操作人、操作账号、操作时间
- 功能测试相关页面在真正提交到后端时会自动归档需求文档：
  - 案例生成页保存案例成功后，会把对应需求文档同步沉淀到这里
  - 案例质检第 2 步“需求分析”提交需求文档后，也会把文档同步沉淀到这里
  - 独立需求分析页提交需求文档后，同样会把文档同步沉淀到这里
- 同一份需求文档按解析后的结构化内容去重；重复提交不会新增多条记录，而是刷新该条记录的最近操作人、账号、操作时间、项目和来源页面

### 配置管理 > 测试用例

- 页面路由为 `/config-management/test-cases`
- 列表字段包含操作时间、测试用例名称、类型、关联需求文档、来源页面、项目、操作人、操作账号、用例条数
- 操作列提供“预览”“导出”，预览抽屉展示用例明细
- 功能测试相关页面在真正提交到后端时会自动归档测试用例：
  - 案例生成页保存案例成功后，最终生成的测试用例会同步沉淀到这里
  - 案例质检第 3 步“案例分析”提交测试用例文件后，解析得到的规范化测试用例会同步沉淀到这里
- 同一批测试用例会按规范化后的 `用例描述 + 测试步骤 + 预期结果` 内容去重；重复提交不会新增多条记录，而是刷新该条记录的最近操作人、账号、操作时间、项目和来源页面

### 案例生成

- 页面路由为 `/functional-testing/case-generation`，侧边栏“功能测试 > 案例生成”可直达该页；页面下方“测试案例记录”区块展示历史已保存案例列表
- 页面顶部当前展示标题“案例生成工作台”和标签，不再展示额外引导副文案和默认推荐卡片
- 页面主体为左侧垂直完整进度侧边栏 + 右侧当前步骤操作区，右侧只显示当前已到达步骤的操作模块，左侧已解锁步骤可点击回退切换；当前流程为“选择项目 -> 复用模板 -> 选择提示词 -> 上传需求文档并自动完成需求映射 -> 生成大纲 -> 生成测试用例”
- “复用模板”默认关闭；开启后展示模板下拉框，选项来自所选项目在“知识库管理 > 系统功能全景图”中维护的全部大纲，生成大纲时会把选中大纲放入“复用模板”分支
- 提示词来源于配置管理 > 提示词管理，页面会优先预选 `requirement`，即“需求分析师”
- 上传控件前端接受 `.doc / .docx`，后端也按 `doc` / `docx` 进行 Word 内容校验；文档上传后会立即调用需求映射接口，把映射结果缓存给后续大纲生成使用
- 点击“生成大纲”后会在当前步骤卡片内展示与主按钮同色系的能量核心过渡动画，阶段节点复用原有粒子动画效果，内部阶段顺序为“分析需求要点”“抽取映射场景”“编排测试步骤”“生成预览结果”
- 未复用模板时，大纲根节点为用例名，下面按多个节点展示 AI 生成的测试用例；复用模板时，大纲根节点为用例名，二级节点为“复用模板”和“AI生成用例”，前者展示选中系统功能全景图大纲，后者展示 AI 生成的测试用例
- 大纲使用系统功能全景图同一套思维导图画布能力，支持拖拽移动、滚轮缩放、工具栏放大/缩小/适应和直接编辑节点；点击“保存大纲”后，最后一步“生成测试用例”才会启用，并按已保存大纲生成最终表格预览
- 结果表格固定展示 `用例ID`、`用例描述`、`测试步骤`、`预期结果`
- 生成结果区域提供“需求映射”“保存案例”按钮；“需求映射”会以居中的宽版弹窗展示上传需求文档时生成的映射数据，缓解侧边预览过于紧凑的问题，当前不再提供当前预览结果的导出按钮
- 后端会优先调用 AI 生成结构化用例；若 AI 不可用，会自动回退为规则生成，并在结果中返回 `generation_mode`、`error`、`record_id`、`created_at`、`operator_name` 等信息
- 需求文档会同步沉淀到“配置管理 > 需求文档”；生成出的测试用例也会同步沉淀到“配置管理 > 测试用例”，两处都会按内容去重并刷新最近一次操作信息
- 页面下方内嵌“测试案例记录”区块，列表字段包含生成时间、需求文档名称、操作人、案例条数，操作栏提供短按钮“预览”和“导出”，避免按钮内容挤出列表区域
- 旧路由 `/functional-testing/test-cases` 仅用于兼容历史链接，访问后会重定向到 `/functional-testing/case-generation`

### 案例质检

- 页面路由为 `/functional-testing/case-quality`
- 页面右上角提供“AI 测试建议”开关；开启时，第 2 步“需求分析”、第 3 步“案例分析”和第 4 步“汇总报告”都会按 `use_ai=true` 调用后端 AI 能力；关闭时这三处都会按 `use_ai=false` 执行，不调用 AI
- 案例质检页不提供提示词选择器；当 AI 开启时，需求分析、案例分析和汇总 AI 测试意见都使用系统默认提示词
- 第 2 步“需求分析”和第 3 步“案例分析”在步骤操作区只保留上传与执行入口，不展示“需求分析概览”“案例分析结果”等报告内容，也不提供需求分析“查看详情”按钮
- 案例质检第 2 步的需求文档上传仅支持 `.doc`、`.docx`，不再支持 `.md` / `.markdown`
- 案例质检第 3 步的测试用例文件支持 `.csv`、`.xlsx`、`.xls`、`.md`、`.markdown`；Markdown 文件可使用表格列或分段键值描述 `用例ID`、`功能`、`步骤`、`预期结果`
- 完整的需求分析内容、案例分析内容、测试建议和综合摘要只在第 4 步“汇总报告”与“案例质检记录详情”中展示
- 第 4 步“汇总报告”与“案例质检记录详情”各只保留一块“AI 测试意见”，位于报告内容最后，不再重复渲染
- “AI 测试意见”会基于需求分析快照、案例分析快照、需求映射建议与代码映射建议生成 `必测项 / 补测项 / 建议回归范围 / 仍缺信息`
- “AI 测试意见”中的 `必测项 / 补测项` 当前合并在同一张表里展示，表格会明确区分类型、优先级、关联需求点、关联方法、测试重点、预期风险和依据说明
- 汇总报告中的 AI 测试意见不复用第 2、3 步的 `ai_analysis`；后端会单独生成 `combined_result_snapshot.ai_test_advice`
- 若案例质检页关闭 AI，汇总报告仍会展示需求映射建议、代码映射建议、覆盖结果与评分，但“AI 测试意见”区域只展示“本次未调用 AI”的提示
- 若 AI 配置缺失或调用失败，汇总报告仍保留需求映射建议、代码映射建议、覆盖结果与评分，同时在“AI 测试意见”区域展示未生成原因
- 生成案例质检记录时，`case_result_snapshot.ai_analysis` 与 `combined_result_snapshot.case_report.ai_analysis` 仍会固定清空，避免汇总报告回放旧的案例 AI 建议
- 第 2 步上传并提交的需求文档会同步沉淀到“配置管理 > 需求文档”；第 3 步上传并提交的测试用例文件会在解析后同步沉淀到“配置管理 > 测试用例”，两处都会按内容去重并刷新最近一次操作信息

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
- 功能测试 > 案例生成写入的审计日志当前统一使用中文模块、操作和说明字段；接口同时会兼容归一化历史英文值（如 `functional-testing`、`generate-test-cases`、`generated and saved N cases`），确保操作记录页展示为中文。

### 生产 / 测试问题文件

- `POST /api/issue-analysis/import`
- `POST /api/defect-analysis/import`
- `GET /api/production-issue-files`
- `POST /api/production-issue-files`
- `GET /api/production-issue-files/{file_id}/analysis`
- `GET /api/test-issue-files`
- `POST /api/test-issue-files`
- `GET /api/test-issue-files/{file_id}/analysis`

### 效能分析文件

- `GET /api/performance-analysis-files`
- `POST /api/performance-analysis-files`
- `GET /api/performance-analysis-files/{file_id}/analysis`

当前行为补充：

- `POST /api/performance-analysis-files` 使用 `multipart/form-data`
- 必填字段：`file`
- 支持上传 `xls`、`xlsx` 格式的完整效能分析工作簿
- 历年原始表支持表头合并场景；如果导入文件因合并单元格产生空白列，接口会自动剔除这些空列，并兼容 `缺陷数 除性能、代码扫描外所有任务类型（SIT+FT）` 作为历年缺陷数字段
- 当前年数据会按 `业务线 + 表类型 + 年份 + 月份` 维度聚合；同一年如果存在多张命名别名表，会优先取命名更标准的表并按月份补齐缺失数据，月份列兼容 `1`、`1月`、`2026年2月`、Excel 日期单元格等写法；团队表即使在月份块之间夹有备注/说明行，也会继续识别后续月份
- 上传成功后返回文件版本元数据，包括 `id`、`file_name`、`file_size`、`sheet_count`、`created_at`
- `GET /api/performance-analysis-files/{file_id}/analysis` 会基于已保存工作簿动态生成看板数据，返回已识别业务线、工作表名称、`current_year`、`businesses[business].history`（年度平均与人均汇总）与 `businesses[business].current`（month_options、monthly summary/external 数据与团队快照）等 history/current 双结构

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
- 所有已登录用户都可调用 `GET /api/prompt-templates` 读取可选提示词；`POST / PUT / DELETE` 仅管理员可调用

### 功能测试案例生成

- `POST /api/functional-testing/case-generation/map`
- `POST /api/functional-testing/case-generation/generate`
- `POST /api/functional-testing/case-generation/save`
- `GET /api/functional-testing/test-cases`
- `GET /api/functional-testing/test-cases/{record_id}`

当前行为补充：

- 三个写入/生成接口均使用 `multipart/form-data`
- `map` 必填字段：`project_id`、`requirement_file`；返回需求映射预览，前端在上传需求文档后自动调用
- `generate` 必填字段：`project_id`、`requirement_file`；可选字段：`prompt_template_key`、`mapping_result_snapshot`、`reasoning_level`，当前前端用于生成大纲中的 AI 用例分支
- `save` 必填字段：`project_id`、`requirement_file`、`case_name`、`mapping_result_snapshot`、`generation_result_snapshot`；可选字段：`prompt_template_key`、`iteration_version`、`source_page`，当前前端在最终测试用例预览确认后调用
- 前端当前接受 `.doc / .docx`；后端按 `doc` / `docx` 进行 Word 内容校验
- `generate` 响应 `data` 包含 `file_name`、`project_id`、`project_name`、`prompt_template_key`、`summary`、`generation_mode`、`provider`、`ai_cost`、`error`、`total`、`cases`
- `cases` 中每条用例包含 `case_id`、`description`、`steps`、`expected_result`
- AI 生成失败时接口会自动回退为基础规则生成，仍返回可展示、可导出的测试用例结果
- `save` 成功后，接口会把需求文档同步写入 `/api/config-management/requirement-documents` 对应的数据源，并把最终测试用例同步写入 `/api/config-management/test-cases` 对应的数据源；两者都会去重并刷新最近一次操作信息

### 配置管理素材库

- `GET /api/config-management/requirement-documents`
- `GET /api/config-management/test-cases`
- `GET /api/config-management/test-cases/{asset_id}`

当前行为补充：

- “需求文档”列表返回 `id`、`file_name`、`file_type`、`file_size`、`project_id`、`project_name`、`source_page`、`operator_name`、`operator_username`、`operated_at`、`created_at`
- “测试用例”列表返回 `id`、`name`、`asset_type`、`file_type`、`file_size`、`case_count`、`requirement_file_name`、`generation_mode`、`provider`、`project_id`、`project_name`、`source_page`、`operator_name`、`operator_username`、`operated_at`、`created_at`
- “测试用例详情”会额外返回 `prompt_template_key` 与 `cases`
- 需求文档按解析后的结构化内容去重；测试用例按规范化后的 `description + steps + expected_result` 内容去重

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
- 案例质检页会根据页面右上角 AI 开关传递 `use_ai`；开启时可返回 AI 需求结论并参与汇总建议，关闭时只输出需求映射结果

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
- `POST /api/analyze` 与 `POST /api/projects/{project_id}/analyze` 的 `test_cases_file` 支持 CSV、Excel 和 Markdown 测试用例文件；Markdown 会优先解析表格，未识别表格时解析 `## 用例ID 功能` 加键值字段的分段内容
- 案例分析、案例质检中的 AI 分析仅当 `use_ai=true` 时后端才会读取 `prompt_template_key`；未传时使用系统默认提示词，`use_ai=false` 时完全不使用提示词
- 案例质检页会根据页面右上角 AI 开关传递 `use_ai`；开启时案例分析会生成 AI 分析结果并参与汇总建议，关闭时只保留代码映射、覆盖结果与评分
- 覆盖分析当前会同时兼容 Excel / CSV / Markdown 测试用例中较泛化的标题表达，并对“`不更新` / `未更新`”这类否定动作做额外拦截，降低被误判成 0 覆盖或误命中的概率
- `POST /api/projects/{project_id}/analyze` 生成的分析记录会持久化 `test_case_count`，供 `/api/records/{record_id}` 和 `/api/case-quality/records/{record_id}` 直接回放
- `POST /api/case-quality/records` 使用 JSON 请求体；除 `project_id`、`requirement_analysis_record_id`、`analysis_record_id`、`code_changes_file_name`、`test_cases_file_name` 外，还支持可选字段 `use_ai`（默认 `true`）
- `POST /api/case-quality/records` 仅当 `use_ai=true` 时才会额外生成 `combined_result_snapshot.ai_test_advice`，供汇总报告与案例质检记录详情直接回放 AI 测试意见；`use_ai=false` 时不会调用 AI，而是返回“本次未调用 AI”的占位说明
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

- `doc`
- `docx`

### 需求分析

- `doc`
- `docx`
- `md`

### 系统功能全景图

- 导入：`xmind`、`md`、`markdown`
- 编辑页下载：`md`、`pdf`、`xmind`、`png`

### 案例质检

- 需求分析步骤需求文档：`doc`、`docx`
- 案例分析步骤测试用例：`csv`、`xls`、`xlsx`、`md`
- 案例分析步骤代码改动：`json`

### 需求映射

- `xls`
- `xlsx`

### 代码映射

- `csv`
- `xls`
- `xlsx`

### 效能分析工作簿

- `xls`
- `xlsx`
- 历年汇总/人均表允许存在合并表头；系统会在展示时自动忽略由合并单元格带出的空白列
- 若历年缺陷列表头使用 `缺陷数 除性能、代码扫描外所有任务类型（SIT+FT）`，系统会按该列生成“最新历年缺陷数”

### 生产 / 测试问题文件

- `csv`
- `xls`
- `xlsx`

## AI 接入说明

### 当前支持的提供方

- `deepseek`：使用 DeepSeek OpenAI 兼容接口
- `internal`：使用公司内部大模型接口

### 默认超时

- 通用 AI 客户端默认超时为 `100` 秒；AI 助手问答以及未单独覆盖超时的 AI 调用都会使用这个默认值
- 接口自动化文档解析、接口自动化用例生成、需求文档测试用例生成等长耗时结构化 AI 场景当前也统一按 `100` 秒超时执行

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
pytest api/tests/test_performance_analysis.py -q
```

```bash
npx vitest run src/pages/PerformanceAnalysis.test.tsx src/components/Layout/AppLayout.test.tsx
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

最后更新：2026-04-29
## 登录页面行为补充

- 登录页面与登录加载态会占满当前浏览器可视高度，避免页面底部出现大面积空白或露出全局背景
- 登录页面高度优先使用 `100dvh`，在不支持的浏览器中回退到 `100vh`
