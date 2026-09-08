# M1 ISM–MICMAC Survey

独立的 M1 ESG 主题关系问卷平台。

- 在线问卷：[hao-tian-xie.github.io/m1-ism-micmac-survey](https://hao-tian-xie.github.io/m1-ism-micmac-survey/)
- 收集 API：[m1-ism-micmac-survey-api.bolly-express-website.workers.dev](https://m1-ism-micmac-survey-api.bolly-express-website.workers.dev/api/m1-submissions)
- 题库：33 个分组后的 ESG 主题（环境 16 个、社会 12 个、治理 5 个），其中 F8+F9 与 F37+F38 保留原始 ESRS 编号追溯，支持简体中文、繁体中文和英文
- 英文名称依据：[欧盟委员会 ESRS 1 Appendix A（EUR-Lex，2025 合并版）](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02023R2772-20250101)；欧盟/EFRAG 未发布中文官方版本，中文名称按中国注册会计师协会、中国金融标准研究及联合国中文术语交叉核对
- 本地运行：`npm install` → `npm run dev`
- 收集服务：`npm run build` → `M1_ADMIN_USER=... M1_ADMIN_PASSWORD=... npm start`

GitHub Pages 负责前端页面；线上提交接口由独立的 Cloudflare Worker 和 D1 数据库运行。
