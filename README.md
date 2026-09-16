# M1 ISM–MICMAC Survey

独立的 M1 ESG 主题关系问卷平台。

- 在线问卷：[hao-tian-xie.github.io/m1-ism-micmac-survey](https://hao-tian-xie.github.io/m1-ism-micmac-survey/)
- 收集 API：[m1-ism-micmac-survey-api.bolly-express-website.workers.dev](https://m1-ism-micmac-survey-api.bolly-express-website.workers.dev/api/m1-submissions)
- 题库：38 个 ESRS Set 1 sustainability matters（环境 19 个、社会 12 个、治理 7 个；包括 G1 腐败和贿赂的两个官方 sub-subtopics），支持简体中文、繁体中文和英文
- 流程：先完成 6 道业务经验主观题，再判断并复核全部 38 个主题；服务器确认 M1 冻结后，才展示个人直接影响结果卡和 Q7。结果卡是个人答卷摘要，不是全体专家汇总，也不是全体样本的 ISM 层级或 MICMAC 分类
- 主观题每题最多 4,000 字；页面提醒不要填写企业/个人身份信息或未公开商业机密。Q1–Q6 与 M1 一起冻结，Q7 只有在对应冻结记录存在后才能提交
- 题目与子子主题依据：[EFRAG ESRS 1（Delegated Act 2023/5303 Annex I，AR 16）](https://www.efrag.org/sites/default/files/sites/webpublishing/SiteAssets/ESRS%201%20Delegated-act-2023-5303-annex-1_en.pdf)；欧盟/EFRAG 未发布中文官方版本，中文名称按中国注册会计师协会、中国金融标准研究及联合国中文术语交叉核对
- 本地运行：`npm install` → `npm run dev`
- 收集服务：`npm run build` → `M1_ADMIN_USER=... M1_ADMIN_PASSWORD=... npm start`

GitHub Pages 负责前端页面；线上提交接口由独立的 Cloudflare Worker 和 D1 数据库运行。
