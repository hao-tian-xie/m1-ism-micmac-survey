# ESG 主题关系问卷

用于访谈中小物流企业管理者与行业专家的 ESG 管理活动关系问卷。当前版本：**vt3**（程序版本 `1.7.0-vt3`）。

- 在线问卷：[hao-tian-xie.github.io/m1-ism-micmac-survey](https://hao-tian-xie.github.io/m1-ism-micmac-survey/)
- 问卷入口先展示交互式研究介绍：先回想实际经验，再浏览 ESRS 的 E/S/G 议题分组，最后用带问号的虚线物流示例理解单向、双向、无促进关系和无法判断。两组示例的方向可独立切换，演示状态仅在内存中保留，不进入答卷或浏览器草稿。介绍支持三语切换、键盘切换和侧栏回看；内容及样式分别位于 `interview-orientation.mjs` 和 `interview-orientation.css`。本页依据 `ESGr2_M1_ESRS_ISM_CEO_Interview_Slides_Guide.md` 改编，正式作答仍以问卷每题的主题和说明为准。
- 收集 API：[m1-ism-micmac-survey-api.bolly-express-website.workers.dev](https://m1-ism-micmac-survey-api.bolly-express-website.workers.dev/api/m1-submissions)
- 题库：38 个 ESRS Set 1 sustainability matters（环境 19 个、社会 12 个、治理 7 个；包括 G1 腐败和贿赂的两个官方 sub-subtopics），支持简体中文、繁体中文和英文
- 流程：交互式研究介绍 → 专家信息与研究者分配的题组 → 业务经验 → 方向与记录练习 → 8–12 项来源任务 → 检查与补充 → 一次提交。原有 7 道业务经验和遗漏问题全部保留，选填题可展开或稍后返回补充。
- 作答：先自由回忆，再按 E/S/G 分页检查全部候选目标，每页5–7项。每项可记录直接帮助、无明确直接帮助、无法判断或稍后检查。38项管理解释卡均含物流示例、相邻议题区别与完整 ESRS 原文。
- 记录：逐项目标状态直接生成方向矩阵，明确判断保存为1或0，无法判断、未检查和未分配分别保留为空值。自由回忆原文独立保存，最多1200字。
- 追问：每项来源可选填一条关键关系的说明（最多800字），确认直接帮助、完全经过中间工作或路径尚待确认，并单独追问反方向。完全经中间工作的路径与直接关系分别保存。
- 访谈预计约 30–45 分钟；时间安排可调整。业务经验每题最多 3,000 字。页面提醒勿填写企业、个人、客户识别信息或未公开商业机密。未提交草稿仅保存在当前浏览器；v3 与 vt3 草稿分开保存。
- 版本、分配规则、数据字段和回退说明：[问卷版本记录](docs/questionnaire-versions.md)。[vt3 题组分配表](docs/vt3-task-plan.csv)列出4种来源侧重、3种任务量下的10个题组，共120套分配方案。研究者负责安排独立专家，检查实际覆盖及各议题的有效判断次数。
- 题目与子子主题依据：[EFRAG ESRS 1（Delegated Act 2023/5303 Annex I，AR 16）](https://www.efrag.org/sites/default/files/sites/webpublishing/SiteAssets/ESRS%201%20Delegated-act-2023-5303-annex-1_en.pdf)；中文名称按中国注册会计师协会、中国金融标准研究及联合国中文术语交叉核对
- 本地运行：`npm install` → `npm run dev`
- 收集服务：`npm run build` → `M1_ADMIN_USER=... M1_ADMIN_PASSWORD=... npm start`

GitHub Pages 负责前端页面；线上提交接口由独立的 Cloudflare Worker 和 D1 数据库运行。

访谈主持、预测试、回顾与二轮追问见[引导式访谈操作指南](docs/guided-interview-protocol.md)。重新生成分配表：`node scripts/build-guided-task-plan.mjs`；按独立专家核查覆盖：`node scripts/report-expert-coverage.mjs export.json coverage.json 3`。
