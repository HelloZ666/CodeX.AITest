# 智测平台

智测平台是一个面向测试质检、问题归纳和缺陷归纳的前后端一体化项目。当前品牌文案为“智测平台@太保科技”，左侧为默认折叠的导航菜单，默认进入“质检分析”页面。

这份 README 的目的不是做宣传，而是给后续维护者和 AI 代理一个可直接上手的项目快照：看完就知道项目做什么、从哪里改、怎么跑起来、哪些地方最容易踩坑。

## 1. 当前功能地图

| 一级菜单 | 二级菜单 | 路由 | 说明 |
| --- | --- | --- | --- |
| 问题归纳 | 生产问题 | `/issue-analysis` | 导入生产问题 Excel/CSV，按原因、措施、阶段、人为原因、总结、标签做归纳并输出图表 |
| 问题归纳 | 缺陷总结 | `/defect-analysis` | 导入缺陷清单 Excel/CSV，按摘要、严重度、业务影响、来源、原因、子原因做归纳并输出图表 |
| 项目管理 | 代码映射关系 | `/projects` | 管理项目、绑定项目级代码映射、查看项目分析统计 |
| 案例质检 | 质检分析 | `/` | 上传代码变更 JSON + 测试用例 CSV/Excel，结合映射关系做覆盖率、评分、AI 建议 |
| 案例质检 | 历史记录 | `/history` | 查看已保存的分析记录、回看详情和导出报告 |

## 2. 适用场景

- 测试负责人做项目级测试质检和历史追踪
- 团队导入生产问题台账，快速输出阶段分布、标签热点和整改方向
- 团队导入缺陷清单，快速输出严重度分布、来源分布和原因热点
- 在代码映射关系齐全的前提下，评估代码变更是否被测试用例覆盖

## 3. 技术栈

### 前端

- React 19
- TypeScript
- Vite
- Ant Design 6
- TanStack Query
- ECharts + `echarts-for-react`
- Axios
- Vitest + Testing Library

### 后端

- FastAPI
- Python 3.11+
- SQLite
- OpenPyXL
- Javalang
- Loguru
- Pydantic

## 4. 目录结构

```text
CodeTestGuard/
├─ src/
│  ├─ components/             # 通用 UI 组件、布局、结果展示
│  ├─ pages/                  # 各菜单页面
│  ├─ types/                  # 前端类型定义
│  ├─ utils/api.ts            # 前端 API 封装
│  └─ App.tsx                 # 前端路由入口
├─ public/                    # 品牌与静态资源（含太保图标）
├─ api/
│  ├─ index.py                # FastAPI 入口和所有接口
│  ├─ services/               # 分析、解析、数据库服务
│  ├─ data/codetestguard.db   # 默认 SQLite 数据库
│  └─ tests/                  # 后端测试
├─ sample_files/              # 示例数据目录
├─ requirements.txt           # 后端依赖
├─ package.json               # 前端依赖与脚本
└─ README.md                  # 本说明
```

## 5. 核心模块说明

### 5.1 案例质检主流程

对应页面：`src/pages/Upload.tsx`

对应后端接口：`POST /api/projects/{project_id}/analyze`

处理链路如下：

1. 上传代码变更 JSON 和测试用例 CSV/Excel。
2. 读取项目绑定的代码映射关系，或者用户临时上传映射文件。
3. `diff_analyzer.py` 解析代码变更摘要。
4. `ast_parser.py` 提取 Java 变更方法。
5. `coverage_analyzer.py` 结合映射关系和测试用例做覆盖匹配。
6. `scoring_model.py` 计算测试质检得分。
7. `deepseek_client.py` 在开启 AI 时生成智能建议。
8. `database.py` 将分析记录落库到 `analysis_records`。

### 5.2 生产问题归纳

对应页面：`src/pages/IssueAnalysis.tsx`

对应后端接口：`POST /api/issue-analysis/import`

核心服务：`api/services/issue_analysis.py`

当前要求的核心字段为：

- 出现该问题的原因
- 改善举措
- 发生阶段
- 是否人为原因
- 发生原因总结
- 标签

输出内容包括：

- 总记录数、阶段数、标签数、人为原因占比
- 关键归纳结论
- 优先改善举措
- 发生阶段分布
- 人为/非人为占比
- 标签热点 Top 10
- 问题原因主题 Top 10
- 发生原因总结 Top 10
- 改善举措 Top 10
- 阶段与人为原因交叉分布
- 导入明细预览

### 5.3 缺陷总结

对应页面：`src/pages/DefectAnalysis.tsx`

对应后端接口：`POST /api/defect-analysis/import`

核心服务：`api/services/defect_analysis.py`

当前要求导入的字段为 35 个：

- 缺陷ID
- 缺陷摘要
- 任务编号
- 系统名称
- 系统CODE
- 需求编号
- 计划发布日期
- 缺陷状态
- 缺陷修复人
- 缺陷修复人p13
- 缺陷严重度
- 重现频率
- 业务影响
- 缺陷来源
- 缺陷原因
- 缺陷子原因
- 缺陷描述
- 缺陷修复描述
- 测试阶段
- 分配处理人
- 分配处理人P13
- 缺陷修复时长
- 修复轮次
- 功能区
- 缺陷关闭时间
- 开发团队
- 测试团队
- 测试用例库
- 功能模块
- 测试项
- 创建人姓名
- 创建人P13
- 创建时间
- 是否初级缺陷
- 初级缺陷依据

当前重点归纳字段为：

- 缺陷摘要
- 缺陷严重度
- 业务影响
- 缺陷来源
- 缺陷原因
- 缺陷子原因

输出内容包括：

- 总缺陷数、严重度分类数、来源分类数、原因分类数
- 关键归纳结论
- 优先治理建议
- 缺陷严重度分布
- 业务影响分布
- 缺陷来源分布
- 缺陷原因 Top 10
- 缺陷子原因 Top 10
- 缺陷摘要热点 Top 10
- 导入明细预览

### 5.4 项目管理与代码映射关系

对应页面：

- `src/pages/Projects.tsx`
- `src/pages/ProjectDetail.tsx`

对应后端接口：

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `PUT /api/projects/{project_id}`
- `DELETE /api/projects/{project_id}`
- `POST /api/projects/{project_id}/mapping`

项目管理的核心作用：

- 建立项目实体
- 绑定项目级代码映射关系
- 在项目详情中查看历史分析次数、平均分、最近分析时间
- 作为“案例质检”的上下文入口

### 5.5 全局映射和历史记录

对应接口：

- `GET /api/mapping`
- `GET /api/mapping/latest`
- `GET /api/mapping/{mapping_id}`
- `POST /api/mapping`
- `DELETE /api/mapping/{mapping_id}`
- `GET /api/records`
- `GET /api/records/{record_id}`

设计意图：

- 全局映射用于没有项目级映射时的默认回退
- 分析记录用于历史追溯、复盘和报告导出

## 6. 数据与文件格式约定

### 6.1 代码变更 JSON

系统支持两种结构：

- 顶层直接包含 `current` 和 `history`
- 顶层包含 `data.current` 和 `data.history`

每个数组元素表示一个 Java 文件的当前版本和历史版本内容。

### 6.2 代码映射文件 CSV

后端在 `api/services/coverage_analyzer.py` 中兼容中英文字段名。核心列为：

| 中文列名 | 英文列名 | 说明 |
| --- | --- | --- |
| 包名 | `package_name` | Java 包名 |
| 类名 | `class_name` | Java 类名 |
| 方法名 | `method_name` | Java 方法名 |
| 功能描述 | `description` | 业务功能描述，用于和测试用例做匹配 |

### 6.3 测试用例文件 CSV/Excel

同样兼容中英文字段名。核心列为：

| 中文列名 | 英文列名 | 说明 |
| --- | --- | --- |
| 测试用例ID | `test_id` | 测试用例唯一标识 |
| 测试功能 | `test_function` | 用于和功能描述做匹配 |
| 测试步骤 | `test_steps` | 展示与辅助分析 |
| 预期结果 | `expected_result` | 展示与辅助分析 |

### 6.4 Excel 解析注意点

Excel 解析入口在 `api/services/file_parser.py`。

当前解析逻辑已经处理以下情况：

- 首行前存在空白行
- 第一个 sheet 为空、第二个 sheet 才有数据
- 某些导出工具写出的错误 worksheet dimension 元数据

最近已用桌面样例 `缺陷清单.xlsx` 复测通过。该文件在 OpenPyXL 的只读模式下会被误判成只有 `A1`，所以当前实现改成了更稳妥的普通模式读取。

## 7. 数据库存储

默认数据库文件：

`api/data/codetestguard.db`

当前表结构如下：

| 表名 | 作用 |
| --- | --- |
| `projects` | 项目基本信息和项目级映射数据 |
| `analysis_records` | 案例质检分析结果、评分、AI 建议、耗时、成本 |
| `global_mapping` | 全局代码映射记录 |

数据库实现位于 `api/services/database.py`，当前使用标准 `sqlite3`，没有 ORM。

## 8. 前后端入口

### 前端入口

- 路由入口：`src/App.tsx`
- 布局与菜单：`src/components/Layout/AppLayout.tsx`
- 全局 API 封装：`src/utils/api.ts`

### 后端入口

- FastAPI 应用：`api/index.py`

主要接口一览：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/analyze` | 使用全局映射做案例质检 |
| POST | `/api/upload/validate` | 校验上传文件格式 |
| POST | `/api/issue-analysis/import` | 生产问题归纳导入 |
| POST | `/api/defect-analysis/import` | 缺陷总结导入 |
| GET/POST/PUT/DELETE | `/api/projects...` | 项目管理 |
| POST | `/api/projects/{project_id}/mapping` | 绑定项目映射 |
| POST | `/api/projects/{project_id}/analyze` | 项目内案例质检 |
| GET | `/api/records` | 历史记录列表 |
| GET | `/api/records/{record_id}` | 历史记录详情 |
| GET/POST/DELETE | `/api/mapping...` | 全局映射管理 |

## 9. 本地开发

### 9.1 前端启动

```bash
npm install
npm run dev
```

默认通过 Vite 代理把 `/api` 转发到 `http://127.0.0.1:8000`，配置在 `vite.config.ts`。

### 9.2 后端启动

推荐在 `api` 目录下启动：

```bash
cd api
python -m pip install -r ../requirements.txt
python -m uvicorn index:app --reload --host 127.0.0.1 --port 8000
```

### 9.3 环境变量

当前代码实际会读取的环境变量：

- `DEEPSEEK_API_KEY`：开启 AI 分析时需要
- `DB_PATH`：可选，自定义 SQLite 文件路径
- `VITE_API_URL`：可选，前端 API 根路径

说明：

- `.env.example` 目前主要体现了 `DEEPSEEK_API_KEY`
- 数据库代码实际读取的是 `DB_PATH`，不是 `DATABASE_URL`

## 10. 测试与构建

### 前端

```bash
npm test
npm run build
```

### 后端

在 `api` 目录下执行：

```bash
python -m pytest -q
```

最近已重点验证的链路：

- `test_file_upload.py`
- `test_issue_analysis.py`
- `test_defect_analysis.py`
- `test_defect_api_integration.py`
- `src/pages/IssueAnalysis.test.tsx`
- `src/pages/DefectAnalysis.test.tsx`
- `src/pages/Projects.test.tsx`
- `src/utils/exportReport.test.ts`

## 11. 二次开发落点

如果后续继续迭代，通常只需要从下面这些位置开始：

### 新增菜单或页面

需要同时修改：

- `src/components/Layout/AppLayout.tsx`
- `src/App.tsx`
- `src/pages/新增页面.tsx`

### 新增一个新的“导入归纳”能力

建议按现有模式复制一套最小闭环：

1. 新建前端页面 `src/pages/XXXAnalysis.tsx`
2. 在 `src/types/index.ts` 增加响应类型
3. 在 `src/utils/api.ts` 增加上传接口
4. 在 `api/services/xxx_analysis.py` 写字段映射和统计逻辑
5. 在 `api/index.py` 暴露 `POST /api/xxx-analysis/import`
6. 补前后端测试

### 修改导入字段规则

主要改这里：

- `api/services/issue_analysis.py` 中的 `REQUIRED_FIELDS`
- `api/services/defect_analysis.py` 中的 `REQUIRED_FIELDS`

如果只是改字段别名，不需要动前端图表逻辑。

### 调整品牌、Logo、侧栏样式

主要改这里：

- `src/components/Layout/AppLayout.tsx`
- `src/index.css`
- `public/CPIC.PNG`
- `public/cpic-mark.png`
- `public/cpic-mark-tight.png`

### 调整质检评分或覆盖率逻辑

主要改这里：

- `api/services/coverage_analyzer.py`
- `api/services/scoring_model.py`
- `api/services/ast_parser.py`
- `api/services/diff_analyzer.py`

## 12. 当前已知问题

- `package.json` 存在重复键，`npm test` 和 `npm run build` 会有 warning，但当前不影响运行
- 打包后 `antd` / `echarts` chunk 仍偏大，Vite 会给出 chunk size warning
- `.env.example` 与数据库实际读取变量名存在信息不一致，后续建议统一

## 13. 维护建议

- 每次新增菜单前，先确认是“独立入口”还是“归属已有一级菜单”，避免路由和菜单层级反复重构
- 每次新增导入能力时，优先先写字段映射常量和测试样例，再写图表页面，返工最少
- 涉及 Excel 导入问题时，先用真实文件在后端单独调用 `parse_excel` 验证，不要只看前端提示
- 如果页面已经改动较多，优先维护这个 README，再继续编码，否则后续上下文会迅速失真

---

最后更新：2026-03-07  
当前产品名：智测平台  
当前品牌落点：智测平台@太保科技
