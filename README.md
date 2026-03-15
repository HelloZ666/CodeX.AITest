# 智测平台

智测平台是一个面向测试团队的前后端一体化分析系统，当前覆盖以下能力：

- 数据看板：对生产问题、测试问题做导入分析与统计展示。
- 需求分析：上传需求文档，按项目自动读取需求映射关系并扩展测试范围，输出风险与测试范围建议。
- 案例分析：基于代码改动、测试用例和映射关系做覆盖与质量分析。
- 项目管理：维护项目基础信息与项目级代码映射。
- 文件管理：维护生产问题、测试问题、需求映射关系、代码映射关系。
- 系统管理：管理员维护用户账号、角色、状态与密码。

当前品牌图统一使用 `public/cpic-mark.png`，登录页和系统内导航保留 logo，业务页面不再显示页面级 logo / 水印。
当前实际行为中：

- `需求分析` 与 `案例分析` 页面都已重构为四步玻璃拟态工作台，上传说明直接内嵌在第 2 步上传卡片中。
- 两个工作台顶部仅保留中文主标题与右侧智能配置卡片，不再展示英文副标题、说明段落和标签胶囊文案。
- 四步卡片默认仅保留步骤标题、状态标签、帮助提示与实际交互控件，步骤标题按单行显示优化。
- 工作台步骤内的长项目名、提示块和跳转链接会自动使用更小字号与更紧凑行高，确保完整显示在卡片范围内。
- 项目选择框内的长项目名允许在控件内按两行展示；提示卡片中的标题、正文和链接也会继续缩放，避免超出卡片边界。
- 当前仅对第 1 步“项目选择”卡片做更细的字号收缩：下拉枚举、已选项目文本和“未绑定映射文件”提示语会比其它步骤更小。
- 第 1 步已选项目名通过独立的选中态标签样式渲染，字号单独压缩，并提高了选中态文字对比度，不再依赖默认 Select 文本样式。
- 第 1 步项目下拉列表当前只展示项目名称本身，不在选项行内追加“已绑定 / 未绑定”状态文字；映射状态统一在卡片正文区域展示。
- 需求分析工作台右侧“智能配置”卡片当前只保留 AI 开关，不再展示“当前项目 / 需求映射”摘要块。
- 案例分析工作台右侧“智能配置”卡片当前只保留 AI 开关，不再展示“当前项目 / 映射关系”摘要块。
- `生产问题分析` 与 `测试问题分析` 页面顶部当前只保留中文主标题和文件/项目胶囊，不再展示英文 eyebrow、说明文案、当前看板文件提示条，以及摘要卡片中的说明性辅助文案。
- `生产问题分析` 与 `测试问题分析` 页底部的“导入明细预览”当前按实际导入字段动态生成列，保留全部导入行，并通过分页和横向滚动查看完整数据。
- 需求分析工作台第 2 步在文件未上传前不再显示底部灰色文件摘要占位块，上传后直接展示文件摘要与进度。
- 需求分析工作台与案例分析工作台的第 2 步上传摘要卡片统一改为上下堆叠展示，文件名、大小与“上传完成”提示不再左右并排，卡片外框尺寸保持不变。
- 案例分析工作台第 2 步在文件未上传前不再显示底部灰色文件摘要占位块，上传后直接展示文件摘要与进度。
- `文件管理` 下的上传页仍以弹窗承载格式、表头和字段要求说明。

## 1. 当前菜单与路由

当前左侧菜单顺序如下：

| 一级菜单 | 二级菜单 | 路由 | 说明 |
| --- | --- | --- | --- |
| 数据看板 | 生产问题分析 | `/issue-analysis` | 基于导入的生产问题文件生成阶段、标签、原因、整改方向等统计看板 |
| 数据看板 | 测试问题分析 | `/defect-analysis` | 基于项目绑定的测试问题文件生成严重度、来源、原因、摘要等统计看板 |
| 需求分析 | 需求分析 | `/requirement-analysis` | 四步工作台：选择项目、上传 `.doc` / `.docx` 需求文档、执行智能解析，并在第 4 步预览报告 |
| 需求分析 | 分析记录 | `/requirement-analysis/history` | 查看需求分析历史记录与结果快照 |
| 案例分析 | 案例分析 | `/` | 四步工作台：选择项目、上传代码改动 JSON 与测试用例 CSV/Excel，结合项目已绑定映射关系分析覆盖与质量 |
| 案例分析 | 分析记录 | `/history` | 查看案例分析历史记录 |
| 项目管理 | 项目列表 | `/project-management` | 维护项目基础信息，并支持按项目名称/描述实时筛选 |
| 文件管理 | 生产问题 | `/production-issues` | 上传并维护全局生产问题文件 |
| 文件管理 | 测试问题 | `/test-issues` | 上传并维护项目级测试问题文件 |
| 文件管理 | 需求映射关系 | `/requirement-mappings` | 按项目维护标签、需求关键字、关联场景的映射关系 |
| 文件管理 | 代码映射关系 | `/projects` | 先选择项目后查看、模板下载、手工新增、上传和替换项目级 CSV/Excel 代码映射，并支持进入项目详情 |
| 系统管理 | 用户管理 | `/users` | 仅管理员可见，维护用户账号 |

补充路由：

- `/login`：登录页
- `/project/:id`：项目详情页，不直接出现在菜单中

## 2. 核心能力概览

### 2.1 数据看板

- 生产问题分析直接读取已上传的全局生产问题文件。
- 测试问题分析按项目读取对应的测试问题文件。
- 页面统一输出概览指标、图表、Top 热点、摘要结论与明细预览。
- 两个分析页的顶部当前仅保留中文标题和胶囊摘要，不再展示英文副标题、说明段落、当前看板文件提示条和摘要说明句。
- “导入明细预览”会按当前导入文件的实际字段动态生成列，不再只显示固定字段；接口返回完整导入行，前端通过分页展示全部数据。
- “导入明细预览”中的编号类字段（如 `任务编号`、`缺陷ID`）保持单行展示，避免在预览列表中被拆成多行；超宽内容通过表格横向滚动查看。
- 测试问题分析里的统计标签会自动清洗 `其他-手动输入(...)` 这类值，图表、摘要和 Top 统计统一只展示括号内内容，例如 `其他-手动输入(03-系统实现)` 会显示为 `03-系统实现`；导入明细预览仍保留原始导入值。

### 2.2 需求分析

当前需求分析链路如下：

- 前端流程：四步工作台 `项目选择 -> 文件上传 -> 智能解析 -> 生成报告`
- 工作台顶部仅保留页面主标题与智能配置卡片，不再展示额外说明文案
- 工作台右侧智能配置卡片当前只保留 AI 补充分析开关，不再显示当前项目与需求映射摘要
- 四步卡片头部仅保留标题与状态标签，不再显示说明性副文案
- 第 1 步内的长项目名、提示块文案与链接会自动缩小字号，保证不超出卡片边界
- 第 2 步内嵌拖拽上传区，上传成功后直接显示文件名、大小、蓝色进度条和完成状态
- 第 2 步上传摘要卡片中的文档信息与“上传完成”提示改为上下堆叠，避免左右并排挤压内容，卡片外框尺寸保持不变
- 第 2 步未上传文件时不再渲染底部灰色占位摘要块；上传成功后直接显示文件摘要
- 第 4 步在结果生成前显示灰色占位态，生成后点亮报告卡片，并提供 `查看详情` 跳转到完整报告
- 当前支持 `.doc`、`.docx`
- 后端会按文件实际内容识别旧版 Word `.doc` 与标准 `.docx`；即使扩展名与实际内容不一致，也优先按实际内容解析
- 后端自动关联：
  - 所选项目当前生效的需求映射关系（若已配置）
- 文档解析优先提取 `4.1` 与 `4.4` 章节；若缺失则回退全文
- 只命中文档正文内容，不命中标题、字段名、表头等噪声文本
- 命中判断由需求映射规则引擎负责，DeepSeek 负责补充总结、风险矩阵、测试建议等 AI 输出
- 若项目未配置需求映射关系，需求分析仍可执行，但不会自动扩展映射测试范围
- 报告详情页当前不再展示“未命中需求点”独立模块；未命中数量仅保留在顶部概览指标中
- 需求映射命中结果会按 `标签 + 需求关键字` 去重；重复的关联场景、命中场景和补齐场景都会自动合并
- “需求映射建议”当前按“映射组 / 需求关键字”聚合展示；多个需求点命中同一组关键字时会合并为一行，并在同一行展示全部命中的需求点与章节
- “逐条命中明细”当前也会按相同映射组组合聚合展示；同一组证据命中的多个需求点会合并到一个折叠面板中，避免重复展开相同内容
- “需求映射建议”中的“测试范围建议”当前按命中的映射组直接展示关联场景标签，不再只显示单段截断文案
- “AI 智能结论”中的“总体判断”会压缩为更短的单句结论；“关键关注点”使用卡片式列表展示
- 需求映射关系命中规则：
  - 若需求正文命中某个 `需求关键字`，则该组下全部 `关联场景` 都纳入测试范围
  - 若需求正文命中某个 `关联场景`，则同组其它 `关联场景` 也一并纳入测试范围
- 需求映射关系匹配策略当前采用“三层命中”：
  - 先做归一化后的直接包含匹配，优先保证准确性
  - 若未直接命中，再做“前后锚点 + 间距限制”的短语匹配，兼容“新增投保页面”这类中间插词写法
  - 对带业务后缀的场景词，如“兼容性测试 / 弹窗内容核对”，会抽取较稳定的业务核心词做受控补充匹配，避免只靠“新增 / 页面 / 弹窗”这类泛词触发
- 支持独立查看分析记录

### 2.3 案例分析

- 前端流程：四步工作台 `项目选择 -> 文件上传 -> 智能解析 -> 生成报告`
- 工作台顶部仅保留页面主标题与智能配置卡片，不再展示额外说明文案
- 四步卡片头部仅保留标题与状态标签，不再显示说明性副文案
- 第 1 步内的长项目名、提示块文案与链接会自动缩小字号，保证不超出卡片边界
- 第 2 步内同时上传两个必填文件：
  - 代码改动 `JSON`
  - 测试用例 `CSV / XLS / XLSX`
- 代码改动 `JSON` 当前支持两种写法：`current / history` 的每个元素都可以是“单个完整代码字符串”或“单文件逐行字符串数组”；`sample_files/` 中的示例已改为单文件逐行数组，便于直接打开阅读
- 第 2 步每个上传摘要卡片中的文件信息与“上传完成”提示改为上下堆叠，避免左右并排造成遮挡，卡片外框尺寸保持不变
- 工作台右侧智能配置卡片当前只保留 AI 深度分析开关，不再显示当前项目与映射关系摘要
- 第 2 步未上传文件时不再渲染底部灰色占位摘要块；上传成功后直接显示文件摘要
- 页面不再提供“临时代码映射文件”上传入口，案例分析直接复用所选项目当前已绑定的代码映射关系
- 所选项目若未绑定代码映射关系，第 3 步解析按钮保持禁用，并提示先前往 `文件管理 > 代码映射关系`
- 报告中的未覆盖且尚未映射的方法，支持直接点击 `新增`，自动带出包名、类名、方法名，并写回当前项目代码映射
- 第 4 步先展示评分、覆盖率、变更文件数和耗时等缩略信息，再通过 `查看详情` 进入完整报告
- 输出 diff 概览、覆盖分析、评分结果、AI 建议
- 分析结果会保存到历史记录

### 2.4 项目管理

- 维护项目名称、描述
- 项目列表顶部提供单层搜索栏，支持按项目名称与描述实时筛选
- 支持绑定项目级代码映射文件
- 项目详情分析报告中的未覆盖方法支持直接新增到当前项目代码映射
- 支持查看项目详情与历史分析统计

### 2.5 文件管理

#### 生产问题

- 维护全局生产问题文件列表
- 最新文件会作为生产问题分析的默认数据源

#### 测试问题

- 维护项目级测试问题文件
- 文件按项目归属展示和替换

#### 需求映射关系

这是当前新增的完整功能，行为如下：

- 路由：`/requirement-mappings`
- 在“文件管理”分组下新增二级菜单“需求映射关系”
- 需求分析会自动读取所选项目当前生效的需求映射关系
- 页面顶部必须先选择项目；未选项目时，`导入` 和 `新增` 按钮禁用，鼠标悬停提示“请先选择项目”
- 操作区提供：
  - `导入`
  - `新增`
  - `模板下载`
- 摘要区展示：
  - 当前项目名
  - 当前来源类型：`upload / manual / mixed`
  - 最近更新时间
  - 最近导入文件名
  - 工作表名
- 明细表固定三列：`标签 / 需求关键字 / 关联场景`
- 表格按后端返回的 `rowSpan` 数据合并显示“标签”和“需求关键字”，不分页，使用纵向滚动

导入规则：

- 直接支持 `.xls` 和 `.xlsx`
- 不要求用户先手工转成 `xlsx`
- 只读取首个非空工作表
- 表头必须严格为：`标签 / 需求关键字 / 关联场景`
- 仅支持三列，不解析额外列
- 支持解析含合并单元格的 Excel
- 跳过纯空白行
- 若存在缺少标签、缺少需求关键字、缺少关联场景或空分组，则整次导入失败
- 上传为全量覆盖当前项目需求映射，覆盖后 `source_type` 重置为 `upload`

手工维护规则：

- 手工维护采用“映射组编辑弹窗”
- 一组数据对应一个 `标签 + 需求关键字`
- 一组内可维护多条“关联场景”
- 支持在弹窗内动态新增、删除场景行，展示效果等同于同组下继续扩展合并单元格
- 场景输入项按顺序显示为 `场景1 / 场景2 / 场景3 ...`
- 表格每个组只在首行显示操作列，支持按组 `编辑`、`删除`
- 保存时直接持久化当前完整数据，不保留页面级草稿
- 同一项目内 `标签 + 需求关键字` 组合唯一；保存时若重复会自动合并到同一组
- 纯手工创建且未导入过文件时，`source_type = manual`
- 在已导入数据基础上再手工增删改后，`source_type = mixed`
- 当删除到 `0` 个组时，后端删除该项目的当前需求映射记录，页面回到“暂无数据”

模板下载规则：

- 通过后端动态生成 `.xlsx`
- 模板包含示例数据与合并区域
- 仓库中不额外维护二进制模板文件
- 示例结构与附件一致：`标签 / 需求关键字 / 关联场景`

#### 代码映射关系

- 路由：`/projects`
- 在“文件管理”分组下维护项目级代码映射文件
- 页面顶部必须先选择项目；未选项目时，`上传映射`、`新增` 和 `项目详情` 按钮禁用，鼠标悬停提示“请先选择项目”
- 操作区提供：
  - `模板下载`
  - `上传映射 / 替换映射`
  - `新增`
  - `项目详情`
- 摘要区展示：
  - 当前项目名
  - 当前是否已绑定映射
  - 映射条目数
  - 项目累计分析次数
  - 项目描述、创建时间、最近更新时间、历史平均分
- 明细表固定四列：`包名 / 类名 / 方法名 / 功能描述`
- 表格展示当前所选项目已绑定的代码映射内容，不分页，使用纵向滚动
- 若当前项目尚未绑定映射，页面展示空状态，并提供 `上传映射文件`、`新增` 与 `查看项目详情` 入口

手工新增规则：

- 页面级 `新增` 采用统一弹窗录入：`包名 / 类名 / 方法名 / 功能描述`
- 四个字段均为必填，保存后直接追加到当前项目的代码映射关系中
- 案例分析工作台和项目详情页的分析报告中，未覆盖且尚未映射的方法也可直接点击 `新增`
- 报告内新增弹窗会自动带出 `包名 / 类名 / 方法名`，用户仅需补充 `功能描述`
- 若当前项目已存在相同 `包名 + 类名 + 方法名`，再次保存时会按该方法覆盖更新功能描述，而不是新增重复条目
- 案例分析报告详情的“测试覆盖分析”中，未覆盖方法保存成功后，操作列按钮会切换为 `已保存`，并保持禁用状态

模板下载规则：

- 通过后端动态生成 `.xlsx`
- 模板表头固定为：`包名 / 类名 / 方法名 / 功能描述`
- 仓库中不额外维护二进制模板文件

上传规则：

- 支持 `.csv`、`.xls`、`.xlsx`
- 上传入口通过弹窗完成，支持拖拽或点击选择文件
- 上传后会直接替换当前项目已绑定的代码映射文件
- 表头支持中文或英文：`包名 / 类名 / 方法名 / 功能描述` 或 `package_name / class_name / method_name / description`
- 上传成功后，案例分析页面和项目详情页会复用当前项目最新绑定的映射数据
- 支持进入 `/project/:id` 查看项目详情

### 2.6 系统管理

- 仅管理员可见
- 支持创建用户、修改角色、启停用户、重置密码

## 3. 需求映射关系的数据结构

后端以分组结构作为唯一真值，不以原始 Excel 行作为存储真值。

标准结构：

```json
{
  "groups": [
    {
      "id": "group-1",
      "tag": "流程变更",
      "requirement_keyword": "抄录",
      "related_scenarios": ["一键抄录", "逐字抄录"]
    }
  ]
}
```

接口返回时会同时提供扁平化 `rows`，其中包含：

- `tag_row_span`
- `requirement_keyword_row_span`
- `operation_row_span`

前端直接消费后端返回值，不自行推导合并逻辑。

## 4. API 概览

### 4.1 认证与用户

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/{user_id}`
- `PUT /api/users/{user_id}/status`
- `PUT /api/users/{user_id}/password`

### 4.2 通用分析与校验

- `GET /api/health`
- `POST /api/upload/validate`
- `POST /api/analyze`
- `POST /api/issue-analysis/import`
- `POST /api/defect-analysis/import`

### 4.3 文件管理

- `GET /api/production-issue-files`
- `POST /api/production-issue-files`
- `GET /api/production-issue-files/{file_id}/analysis`
- `GET /api/test-issue-files`
- `POST /api/test-issue-files`
- `GET /api/test-issue-files/{file_id}/analysis`
- `GET /api/requirement-mapping-template`
- `GET /api/project-mapping-template`
- `GET /api/projects/{project_id}/requirement-mapping`
- `POST /api/projects/{project_id}/requirement-mapping`
- `PUT /api/projects/{project_id}/requirement-mapping`

### 4.4 需求分析

- `POST /api/requirement-analysis/analyze`
- `GET /api/requirement-analysis/records`
- `GET /api/requirement-analysis/records/{record_id}`
- 兼容保留的规则接口（当前前端已不再暴露入口，需求分析主链路也不再依赖这些规则）：
- `GET /api/requirement-analysis/rules`
- `POST /api/requirement-analysis/rules`
- `PUT /api/requirement-analysis/rules/{rule_id}`
- `DELETE /api/requirement-analysis/rules/{rule_id}`

### 4.5 项目与案例分析

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `PUT /api/projects/{project_id}`
- `DELETE /api/projects/{project_id}`
- `POST /api/projects/{project_id}/mapping`
- `POST /api/projects/{project_id}/mapping/entries`
- `POST /api/projects/{project_id}/analyze`
- `GET /api/records`
- `GET /api/records/{record_id}`

### 4.6 全局代码映射

- `GET /api/mapping`
- `GET /api/mapping/latest`
- `GET /api/mapping/{mapping_id}`
- `POST /api/mapping`
- `DELETE /api/mapping/{mapping_id}`

## 5. 前后端类型与接口位置

前端新增的需求映射关系类型位于：

- `src/types/index.ts`
  - `RequirementMappingSourceType`
  - `RequirementMappingGroup`
  - `RequirementMappingRow`
  - `RequirementMappingDetail`

前端 API 封装位于：

- `src/utils/api.ts`
  - `getRequirementMapping`
  - `uploadRequirementMapping`
  - `saveRequirementMapping`
  - `downloadRequirementMappingTemplate`

后端核心实现位于：

- `api/services/requirement_mapping.py`
- `api/services/database.py`
- `api/index.py`

## 6. 技术栈与依赖

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
- xlrd
- xlwt
- python-docx
- olefile
- javalang
- loguru
- pydantic

与文档解析及需求映射关系相关的新增依赖：

- `xlrd`：解析 `.xls`
- `xlwt`：测试中生成 `.xls` 示例文件
- `python-docx`：解析 `.docx` 需求文档
- `olefile`：解析旧版 `.doc` 需求文档的 OLE 结构

## 7. 目录结构

```text
CodeX.AITest/
├─ src/
│  ├─ components/             # 通用组件、布局、图表、结果展示
│  ├─ pages/                  # 页面级组件
│  ├─ types/                  # 前端类型定义
│  ├─ utils/api.ts            # 前端 API 封装
│  ├─ auth/                   # 登录态与路由守卫
│  └─ App.tsx                 # 前端路由入口
├─ public/                    # 静态资源与品牌图
├─ api/
│  ├─ index.py                # FastAPI 入口与接口定义
│  ├─ services/               # 分析、解析、数据库、文件服务
│  ├─ tests/                  # 后端测试
│  └─ data/                   # SQLite 数据
├─ sample_files/              # 示例文件
├─ requirements.txt           # 后端依赖
├─ package.json               # 前端依赖与脚本
├─ start-dev.bat              # Windows 一键启动脚本
├─ .env.example               # 环境变量模板
├─ AGENTS.md                  # 仓库协作规则
└─ README.md                  # 当前说明文档
```

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

默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端健康检查：`http://127.0.0.1:8000/api/health`

### 8.3 Windows 一键启动

```bash
copy .env.example .env
start-dev.bat
```

`start-dev.bat` 会：

- 检查 `python`、`npm`、`package.json`、`api/index.py`
- 读取根目录 `.env`
- 分别启动前端和后端
- 提示 `5173` 与 `8000` 端口占用情况

也可以只做环境检查：

```bash
start-dev.bat --check
```

## 9. 环境变量

当前实际使用的环境变量如下：

- `DEEPSEEK_API_KEY`：DeepSeek 调用凭证
- `SESSION_SECRET`：会话签名密钥
- `INITIAL_ADMIN_USERNAME`：首次初始化管理员账号
- `INITIAL_ADMIN_PASSWORD`：首次初始化管理员密码
- `INITIAL_ADMIN_DISPLAY_NAME`：首次初始化管理员显示名
- `DB_PATH`：可选，自定义 SQLite 文件路径；默认使用 `api/data/codetestguard.db`
- `VITE_API_URL`：可选，自定义前端 API 根地址；未设置时默认走 `/api`
- `CORS_ALLOW_ORIGINS`：可选，覆盖允许跨域的前端地址，多个地址用英文逗号分隔
- `SESSION_COOKIE_SECURE`：可选，设为 `true/1/yes` 时仅通过 HTTPS 发送 Cookie
- `SESSION_COOKIE_SAMESITE`：可选，默认 `lax`

建议首次启动前先复制 `.env.example` 并填写认证相关变量。

## 10. 测试与构建

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

本次与“需求映射关系”相关的重点验证包括：

- `src/pages/RequirementMappings.test.tsx`
- `src/components/Layout/AppLayout.test.tsx`
- `api/tests/test_requirement_mapping.py`
- `api/tests/test_file_upload.py`
- `api/tests/test_database.py`
- `api/tests/test_api_integration.py`

本次与“需求分析收口到需求映射关系”相关的重点验证包括：

- `src/pages/RequirementAnalysis.test.tsx`
- `src/components/RequirementAnalysis/RequirementAnalysisResult.test.tsx`
- `api/tests/test_requirement_analysis_rules.py`
- `api/tests/test_requirement_analysis_api.py`
- `api/tests/test_deepseek_client.py`

本次与“代码映射关系页面改造”相关的重点验证包括：

- `src/pages/Projects.test.tsx`
- `src/pages/Upload.test.tsx`
- `src/pages/ProjectDetail.test.tsx`
- `api/tests/test_api_integration.py`

## 11. 当前注意事项

- 需求映射关系首版只支持三列表头：`标签 / 需求关键字 / 关联场景`
- 需求映射关系只读取首个非空工作表，不提供多 Sheet 选择
- 需求映射关系当前真值始终是分组结构 `groups_json`，不提供历史版本切换
- 导入需求映射文件会全量覆盖当前项目数据
- 手工新增、编辑、删除会直接持久化当前项目的最新结果
- 需求分析在项目未配置需求映射关系时仍可执行，但不会自动扩展映射测试范围
- 需求分析要求上传内容必须是有效的 Word 文档；标准 `.docx`、旧版 `.doc` 都支持，损坏文件仍会被拒绝
- 代码映射关系当前以项目为粒度维护，支持模板下载、手工新增以及 `.csv / .xls / .xlsx` 上传覆盖
- 案例分析工作台与项目详情页的“测试覆盖分析”中，未覆盖且未保存的方法显示 `新增`；已保存到项目映射的方法显示禁用态 `已保存`
- 系统使用 Cookie 会话；复制数据库到新环境后，通常仍需重新登录
- 如果代码与文档不一致，应优先修正文档，保持 `README.md` 描述的是当前实际行为

---

最后更新：2026-03-15
