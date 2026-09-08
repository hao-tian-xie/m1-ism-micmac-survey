# M1 ISM–MICMAC Survey

独立的 M1 ESG 主题关系问卷平台。

- 在线问卷：[hao-tian-xie.github.io/m1-ism-micmac-survey](https://hao-tian-xie.github.io/m1-ism-micmac-survey/)
- 收集 API：[m1-ism-micmac-survey-api.bolly-express-website.workers.dev](https://m1-ism-micmac-survey-api.bolly-express-website.workers.dev/api/m1-submissions)
- 题库：38 个 ESRS Set 1 sustainability matters（环境 19 个、社会 12 个、治理 7 个；包括 G1 腐败和贿赂的两个官方 sub-subtopics），支持简体中文、繁体中文和英文
- 题目与子子主题依据：[EFRAG ESRS 1（Delegated Act 2023/5303 Annex I，AR 16）](https://www.efrag.org/sites/default/files/sites/webpublishing/SiteAssets/ESRS%201%20Delegated-act-2023-5303-annex-1_en.pdf)；欧盟/EFRAG 未发布中文官方版本，中文名称按中国注册会计师协会、中国金融标准研究及联合国中文术语交叉核对
- 本地运行：`npm install` → `npm run dev`
- 收集服务：`npm run build` → `M1_ADMIN_USER=... M1_ADMIN_PASSWORD=... npm start`

GitHub Pages 负责前端页面；线上提交接口由独立的 Cloudflare Worker 和 D1 数据库运行。
