# M1 ISM–MICMAC Survey

独立的 M1 ESG 主题关系问卷平台。

- 在线问卷：[hao-tian-xie.github.io/m1-ism-micmac-survey](https://hao-tian-xie.github.io/m1-ism-micmac-survey/)
- 收集 API：[m1-ism-micmac-survey-api.bolly-express-website.workers.dev](https://m1-ism-micmac-survey-api.bolly-express-website.workers.dev/api/m1-submissions)
- 题库：38 个 ESRS Set 1 sustainability matters（37 个 subtopics，另将 G1 腐败和贿赂的两个官方 sub-subtopics 分开呈现），支持简体中文、繁体中文和英文
- 依据： [ESRS 1 Appendix A（EFRAG）](https://www.efrag.org/sites/default/files/media/document/2024-08/ESRS%201%20Delegated-act-2023-5303-annex-1_en.pdf)
- 本地运行：`npm install` → `npm run dev`
- 收集服务：`npm run build` → `M1_ADMIN_USER=... M1_ADMIN_PASSWORD=... npm start`

GitHub Pages 负责前端页面；线上提交接口由独立的 Cloudflare Worker 和 D1 数据库运行。
