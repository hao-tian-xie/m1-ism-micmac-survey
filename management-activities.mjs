import { studyConfig } from './survey-config.mjs';

// Interview interpretations, not additions to or replacements for ESRS.
// Examples describe one activity; they do not suggest links to other factors.
const rows = [
  [
    ['气候适应管理', '应对高温、暴雨、洪水等气候风险，维持运输和仓储服务。', '例如：极端天气预案、易受洪水影响的仓库检查。'],
    ['氣候適應管理', '應對高溫、暴雨、洪水等氣候風險，維持運輸和倉儲服務。', '例如：極端天氣預案、易受洪水影響的倉庫檢查。'],
    ['Climate adaptation', 'Manage climate risks such as heat, heavy rain and flooding to maintain transport and warehousing services.', 'Examples: severe-weather plans and checks at flood-prone warehouses.'],
  ],
  [
    ['温室气体排放管理', '管理运输、仓储及相关业务的温室气体排放，采取减排措施。', '例如：运输排放核算、车辆减排计划。'],
    ['溫室氣體排放管理', '管理運輸、倉儲及相關業務的溫室氣體排放，採取減排措施。', '例如：運輸排放核算、車輛減排計劃。'],
    ['Greenhouse gas emissions', 'Manage greenhouse gas emissions from transport, warehousing and related activities, and take steps to reduce them.', 'Examples: transport emissions calculations and vehicle emissions reduction plans.'],
  ],
  [
    ['能源管理', '管理车辆燃料、仓库用电及其他能源使用。', '例如：油耗记录、仓库照明节能、能源采购。'],
    ['能源管理', '管理車輛燃料、倉庫用電及其他能源使用。', '例如：油耗記錄、倉庫照明節能、能源採購。'],
    ['Energy management', 'Manage vehicle fuel, warehouse electricity and other energy use.', 'Examples: fuel records, efficient warehouse lighting and energy purchasing.'],
  ],
  [
    ['空气污染管理', '控制车辆、设备及场站向空气排放的污染物。', '例如：尾气检查、场站粉尘控制。'],
    ['空氣污染管理', '控制車輛、設備及場站向空氣排放的污染物。', '例如：廢氣檢查、場站粉塵控制。'],
    ['Air pollution', 'Control air pollutants from vehicles, equipment and operating sites.', 'Examples: exhaust checks and dust control at depots.'],
  ],
  [
    ['水污染管理', '控制业务活动中的污水排放及污染物进入水体的风险。', '例如：洗车废水处理、油品泄漏防护。'],
    ['水污染管理', '控制業務活動中的污水排放及污染物進入水體的風險。', '例如：洗車廢水處理、油品洩漏防護。'],
    ['Water pollution', 'Control wastewater and the risk of pollutants entering water bodies.', 'Examples: vehicle-wash wastewater treatment and oil spill prevention.'],
  ],
  [
    ['土壤污染管理', '防止燃油、化学品或其他污染物污染场站及周边土壤。', '例如：储油区防渗、泄漏检查和处置。'],
    ['土壤污染管理', '防止燃油、化學品或其他污染物污染場站及周邊土壤。', '例如：儲油區防滲、洩漏檢查和處置。'],
    ['Soil pollution', 'Prevent fuel, chemicals and other pollutants from contaminating soil at and around operating sites.', 'Examples: containment at fuel storage areas, leak checks and spill response.'],
  ],
  [
    ['生物及食物资源污染管理', '管理污染物进入生物或食物资源的风险。', '例如：涉及食品运输时的污染防护、污染事故处理。'],
    ['生物及食物資源污染管理', '管理污染物進入生物或食物資源的風險。', '例如：涉及食品運輸時的污染防護、污染事故處理。'],
    ['Pollution of organisms and food resources', 'Manage the risk of pollutants entering living organisms or food resources.', 'Examples: contamination controls where food is transported, and pollution incident response.'],
  ],
  [
    ['关注物质管理', '识别和管理业务中使用、储存或运输的关注物质。', '例如：化学品清单、安全资料和储运要求。'],
    ['關注物質管理', '識別和管理業務中使用、儲存或運輸的關注物質。', '例如：化學品清單、安全資料和儲運要求。'],
    ['Substances of concern', 'Identify and manage substances of concern used, stored or transported in the business.', 'Examples: chemical inventories, safety information and storage and transport requirements.'],
  ],
  [
    ['高度关注物质管理', '识别高度关注物质，并管理接触、使用及替代安排。', '例如：核查货物或材料中的相关物质及处理要求。'],
    ['高度關注物質管理', '識別高度關注物質，並管理接觸、使用及替代安排。', '例如：核查貨物或材料中的相關物質及處理要求。'],
    ['Substances of very high concern', 'Identify substances of very high concern and manage exposure, use and substitution arrangements.', 'Examples: checks on relevant substances in goods or materials and their handling requirements.'],
  ],
  [
    ['微塑料管理', '管理业务活动中微塑料的产生和释放。', '例如：塑料颗粒散落防护、轮胎磨损颗粒管理。'],
    ['微塑料管理', '管理業務活動中微塑料的產生和釋放。', '例如：塑料顆粒散落防護、輪胎磨損顆粒管理。'],
    ['Microplastics', 'Manage the generation and release of microplastics in business activities.', 'Examples: plastic pellet spill prevention and management of tyre-wear particles.'],
  ],
  [
    ['用水与水资源管理', '管理取水、用水、排水，以及水资源短缺对业务的影响。', '例如：洗车用水记录、节水和水回用安排。'],
    ['用水與水資源管理', '管理取水、用水、排水，以及水資源短缺對業務的影響。', '例如：洗車用水記錄、節水和水回用安排。'],
    ['Water use and water resources', 'Manage water withdrawal, use and discharge, and the effects of water scarcity on operations.', 'Examples: vehicle-wash water records, water saving and reuse arrangements.'],
  ],
  [
    ['海洋资源管理', '在涉及海运或海洋资源的业务中，管理对海洋资源的使用和影响。', '例如：核查相关海洋资源的来源和使用记录。'],
    ['海洋資源管理', '在涉及海運或海洋資源的業務中，管理對海洋資源的使用和影響。', '例如：核查相關海洋資源的來源和使用記錄。'],
    ['Marine resources', 'Where operations involve shipping or marine resources, manage the use of and effects on marine resources.', 'Examples: checking the sources and use records of relevant marine resources.'],
  ],
  [
    ['生物多样性压力管理', '管理土地利用、资源开发、外来物种、污染及气候变化等对生物多样性的直接压力。', '例如：场站选址检查、运输中的外来物种防护。'],
    ['生物多樣性壓力管理', '管理土地利用、資源開發、外來物種、污染及氣候變化等對生物多樣性的直接壓力。', '例如：場站選址檢查、運輸中的外來物種防護。'],
    ['Pressures on biodiversity', 'Manage direct pressures on biodiversity, including land use, resource exploitation, invasive species, pollution and climate change.', 'Examples: depot location checks and invasive-species controls in transport.'],
  ],
  [
    ['物种影响管理', '识别并管理运输、场站等活动对物种数量及生存状况的影响。', '例如：敏感物种调查、相关作业限制。'],
    ['物種影響管理', '識別並管理運輸、場站等活動對物種數量及生存狀況的影響。', '例如：敏感物種調查、相關作業限制。'],
    ['Effects on species', 'Identify and manage how transport, depots and other activities affect species populations and condition.', 'Examples: surveys of sensitive species and related operating restrictions.'],
  ],
  [
    ['生态系统影响管理', '管理场站、仓库及运输设施对生态系统范围和状况的影响。', '例如：建设前的栖息地检查、受影响区域的恢复安排。'],
    ['生態系統影響管理', '管理場站、倉庫及運輸設施對生態系統範圍和狀況的影響。', '例如：建設前的棲息地檢查、受影響區域的恢復安排。'],
    ['Effects on ecosystems', 'Manage how depots, warehouses and transport infrastructure affect the extent and condition of ecosystems.', 'Examples: habitat checks before construction and restoration of affected areas.'],
  ],
  [
    ['生态系统服务管理', '识别业务对自然提供的水源供应、洪水调蓄等服务的依赖及影响。', '例如：检查场站对自然排水和水源的依赖。'],
    ['生態系統服務管理', '識別業務對自然提供的水源供應、洪水調蓄等服務的依賴及影響。', '例如：檢查場站對自然排水和水源的依賴。'],
    ['Ecosystem services', 'Identify the business’s dependence on and effects on services provided by nature, such as water supply and flood regulation.', 'Examples: checking a depot’s dependence on natural drainage and water sources.'],
  ],
  [
    ['材料与资源投入管理', '管理包装、设备及其他投入资源的采购和使用。', '例如：包装材料用量、再生材料采购记录。'],
    ['材料與資源投入管理', '管理包裝、設備及其他投入資源的採購和使用。', '例如：包裝材料用量、再生材料採購記錄。'],
    ['Materials and resource inputs', 'Manage the purchasing and use of packaging, equipment and other resource inputs.', 'Examples: packaging quantities and recycled-material purchasing records.'],
  ],
  [
    ['产品与服务的资源流出管理', '管理产品或服务交付后的材料去向、耐用性、重复使用和回收。', '例如：周转箱回收、可重复使用包装的流转记录。'],
    ['產品與服務的資源流出管理', '管理產品或服務交付後的材料去向、耐用性、重複使用和回收。', '例如：周轉箱回收、可重複使用包裝的流轉記錄。'],
    ['Resource outputs from products and services', 'Manage material destinations, durability, reuse and recycling after products or services are delivered.', 'Examples: returnable-container collection and reusable-packaging movement records.'],
  ],
  [
    ['废弃物管理', '减少废弃物，并管理分类、储存、转运和处理。', '例如：废包装分类、废油处置和去向记录。'],
    ['廢棄物管理', '減少廢棄物，並管理分類、儲存、轉運和處理。', '例如：廢包裝分類、廢油處置和去向記錄。'],
    ['Waste management', 'Reduce waste and manage its sorting, storage, transport and treatment.', 'Examples: packaging-waste sorting, waste-oil disposal and destination records.'],
  ],
  [
    ['自有员工工作条件管理', '管理员工的就业、工时、工资、协商、工作与生活平衡及健康安全。', '例如：司机排班、工资记录、安全作业安排。'],
    ['自有員工工作條件管理', '管理員工的就業、工時、工資、協商、工作與生活平衡及健康安全。', '例如：司機排班、工資記錄、安全作業安排。'],
    ['Own workforce: working conditions', 'Manage employment, hours, pay, dialogue, work-life balance, and health and safety for the business’s own workforce.', 'Examples: driver rosters, pay records and safe working arrangements.'],
  ],
  [
    ['自有员工公平待遇与发展', '管理员工的平等待遇、同工同酬、培训、残障融入、反骚扰及多元化。', '例如：培训安排、公平招聘、骚扰投诉处理。'],
    ['自有員工公平待遇與發展', '管理員工的平等待遇、同工同酬、培訓、殘疾共融、反騷擾及多元化。', '例如：培訓安排、公平招聘、騷擾投訴處理。'],
    ['Own workforce: equal treatment and development', 'Manage equal treatment and pay, training, disability inclusion, anti-harassment and diversity for the business’s own workforce.', 'Examples: training, fair recruitment and handling harassment complaints.'],
  ],
  [
    ['自有员工其他劳动权利', '管理童工、强迫劳动、住房、水和卫生及员工隐私方面的风险。', '例如：用工年龄核查、员工资料权限管理。'],
    ['自有員工其他勞動權利', '管理童工、強迫勞動、住房、水和衞生及員工私隱方面的風險。', '例如：用工年齡核查、員工資料權限管理。'],
    ['Own workforce: other rights', 'Manage risks concerning child labour, forced labour, housing, water and sanitation, and workforce privacy.', 'Examples: age checks and access controls for employee information.'],
  ],
  [
    ['合作方工作人员的工作条件', '管理承运商等价值链工作人员的就业、工时、工资、协商及健康安全等工作条件。', '例如：承运商安全监督、外包人员工时要求。'],
    ['合作方工作人員的工作條件', '管理承運商等價值鏈工作人員的就業、工時、工資、協商及健康安全等工作條件。', '例如：承運商安全監督、外判人員工時要求。'],
    ['Working conditions in the value chain', 'Manage working conditions for carrier and other value-chain workers, including employment, hours, pay, dialogue, and health and safety.', 'Examples: carrier safety oversight and working-time requirements for outsourced workers.'],
  ],
  [
    ['合作方工作人员的公平待遇与发展', '管理价值链工作人员的平等待遇、培训、残障融入、反骚扰及多元化。', '例如：供应商平等待遇要求、外包人员培训安排。'],
    ['合作方工作人員的公平待遇與發展', '管理價值鏈工作人員的平等待遇、培訓、殘疾共融、反騷擾及多元化。', '例如：供應商平等待遇要求、外判人員培訓安排。'],
    ['Equal treatment and development in the value chain', 'Manage equal treatment, training, disability inclusion, anti-harassment and diversity for value-chain workers.', 'Examples: supplier equal-treatment requirements and training for outsourced workers.'],
  ],
  [
    ['合作方工作人员的其他劳动权利', '管理价值链中的童工、强迫劳动、住房、水和卫生及工作人员隐私风险。', '例如：供应商劳动权利核查、合作方人员资料保护。'],
    ['合作方工作人員的其他勞動權利', '管理價值鏈中的童工、強迫勞動、住房、水和衞生及工作人員私隱風險。', '例如：供應商勞動權利核查、合作方人員資料保護。'],
    ['Other rights of value-chain workers', 'Manage risks concerning child labour, forced labour, housing, water and sanitation, and privacy in the value chain.', 'Examples: supplier labour-rights checks and protection of partner workers’ information.'],
  ],
  [
    ['社区生活与资源影响管理', '管理物流活动对社区住房、食物、水和卫生、土地及安全的影响。', '例如：场站周边通行与安全安排、土地使用沟通。'],
    ['社區生活與資源影響管理', '管理物流活動對社區住房、食物、水和衞生、土地及安全的影響。', '例如：場站周邊通行與安全安排、土地使用溝通。'],
    ['Community living conditions and resources', 'Manage effects of logistics activities on community housing, food, water and sanitation, land and security.', 'Examples: access and security arrangements around depots, and communication about land use.'],
  ],
  [
    ['社区表达与参与权利', '管理企业活动对社区表达、集会及人权捍卫者的影响。', '例如：社区意见渠道、对提出异议者的保护安排。'],
    ['社區表達與參與權利', '管理企業活動對社區表達、集會及人權捍衛者的影響。', '例如：社區意見渠道、對提出異議者的保護安排。'],
    ['Community expression and participation rights', 'Manage effects on community freedom of expression, assembly and human-rights defenders.', 'Examples: community feedback channels and protection for people who raise concerns.'],
  ],
  [
    ['原住民族权利管理', '涉及原住民族时，管理自由、事先和知情同意、自决及文化权利。', '例如：相关地区设施选址前的协商与同意记录。'],
    ['原住民族權利管理', '涉及原住民族時，管理自由、事先和知情同意、自決及文化權利。', '例如：相關地區設施選址前的協商與同意記錄。'],
    ['Indigenous peoples’ rights', 'Where indigenous peoples are affected, manage free, prior and informed consent, self-determination and cultural rights.', 'Examples: consultation and consent records before locating facilities in relevant areas.'],
  ],
  [
    ['客户及最终用户信息管理', '保护客户和最终用户的隐私、表达权利及获取高质量信息的机会。', '例如：收件人资料保护、清楚准确的服务信息。'],
    ['客戶及最終用戶資訊管理', '保護客戶和最終用戶的私隱、表達權利及獲取高質量資訊的機會。', '例如：收件人資料保護、清楚準確的服務資訊。'],
    ['Customer and end-user information', 'Protect privacy, freedom of expression and access to quality information for customers and end-users.', 'Examples: recipient data protection and clear, accurate service information.'],
  ],
  [
    ['客户及最终用户安全管理', '管理物流产品和服务对使用者健康、人身安全及儿童保护的影响。', '例如：交付安全、危险货物服务中的使用者防护。'],
    ['客戶及最終用戶安全管理', '管理物流產品和服務對使用者健康、人身安全及兒童保障的影響。', '例如：交付安全、危險貨物服務中的使用者防護。'],
    ['Customer and end-user safety', 'Manage effects of logistics products and services on users’ health, personal safety and child protection.', 'Examples: safe deliveries and user protection in dangerous-goods services.'],
  ],
  [
    ['客户及最终用户包容性管理', '管理服务中的非歧视、可及性及负责任营销。', '例如：无障碍服务安排、清楚说明服务条件。'],
    ['客戶及最終用戶共融管理', '管理服務中的不歧視、可及性及負責任營銷。', '例如：無障礙服務安排、清楚說明服務條件。'],
    ['Customer and end-user inclusion', 'Manage non-discrimination, access to services and responsible marketing.', 'Examples: accessible service arrangements and clear service terms.'],
  ],
  [
    ['企业文化与行为管理', '将企业价值观和行为要求落实到决策与日常工作。', '例如：管理层行为要求、员工行为守则。'],
    ['企業文化與行為管理', '將企業價值觀和行為要求落實到決策與日常工作。', '例如：管理層行為要求、員工行為守則。'],
    ['Corporate culture and conduct', 'Put organisational values and conduct expectations into decisions and daily work.', 'Examples: management conduct expectations and employee codes of conduct.'],
  ],
  [
    ['举报与举报人保护', '设置可安全反映问题的渠道，并保护举报人免受报复。', '例如：保密举报、独立调查和反报复安排。'],
    ['舉報與舉報人保護', '設置可安全反映問題的渠道，並保護舉報人免受報復。', '例如：保密舉報、獨立調查和反報復安排。'],
    ['Reporting concerns and protecting whistleblowers', 'Provide safe reporting channels and protect whistleblowers from retaliation.', 'Examples: confidential reporting, independent investigations and anti-retaliation arrangements.'],
  ],
  [
    ['动物福利管理', '涉及活体动物或相关供应链时，管理动物的待遇与福利。', '例如：活体动物运输条件、承运商操作要求。'],
    ['動物福利管理', '涉及活體動物或相關供應鏈時，管理動物的待遇與福利。', '例如：活體動物運輸條件、承運商操作要求。'],
    ['Animal welfare', 'Where operations involve live animals or related supply chains, manage animal treatment and welfare.', 'Examples: live-animal transport conditions and carrier handling requirements.'],
  ],
  [
    ['政治参与与游说管理', '管理企业的政治参与、游说及政治捐款。', '例如：相关活动审批、支出和立场记录。'],
    ['政治參與與遊說管理', '管理企業的政治參與、遊說及政治捐款。', '例如：相關活動審批、支出和立場記錄。'],
    ['Political engagement and lobbying', 'Manage the business’s political engagement, lobbying and political contributions.', 'Examples: approvals and records of relevant activities, spending and positions.'],
  ],
  [
    ['供应商与承运商关系管理', '管理供应商选择、合作协调、信息交换及公平及时的付款。', '例如：承运商管理程序、资料交接和付款安排。'],
    ['供應商與承運商關係管理', '管理供應商選擇、合作協調、資訊交換及公平及時的付款。', '例如：承運商管理程序、資料交接和付款安排。'],
    ['Supplier and carrier relationships', 'Manage supplier selection, coordination, information exchange, and fair and timely payment.', 'Examples: carrier management procedures, information handovers and payment arrangements.'],
  ],
  [
    ['反腐败与反贿赂预防', '通过程序、检查和培训预防并发现腐败与贿赂。', '例如：利益冲突申报、采购检查和反贿赂培训。'],
    ['反貪腐與反賄賂預防', '透過程序、檢查和培訓預防並發現貪腐與賄賂。', '例如：利益衝突申報、採購檢查和反賄賂培訓。'],
    ['Preventing and detecting corruption and bribery', 'Use procedures, checks and training to prevent and detect corruption and bribery.', 'Examples: conflict-of-interest declarations, purchasing checks and anti-bribery training.'],
  ],
  [
    ['腐败与贿赂事件处理', '记录并处理已确认的腐败与贿赂事件及其结果。', '例如：事件调查、整改措施及处理结果记录。'],
    ['貪腐與賄賂事件處理', '記錄並處理已確認的貪腐與賄賂事件及其結果。', '例如：事件調查、整改措施及處理結果記錄。'],
    ['Handling corruption and bribery incidents', 'Record and address confirmed corruption and bribery incidents and their outcomes.', 'Examples: investigations, corrective actions and records of outcomes.'],
  ],
];

const localeIndex = { 'zh-CN': 0, 'zh-HK': 1, en: 2 };
export const MANAGEMENT_ACTIVITIES = Object.freeze(Object.fromEntries(studyConfig.factors.map((factor, index) => [
  factor.esrs.key, Object.fromEntries(Object.keys(localeIndex).map((locale) => {
    const [title, meaning, example] = rows[index][localeIndex[locale]];
    return [locale, { title, meaning, example }];
  })),
])));

export function managementActivity(factor, locale = 'en') {
  const entry = MANAGEMENT_ACTIVITIES[factor?.esrs?.key]?.[locale];
  if (entry) return entry;
  const localized = (text) => typeof text === 'string' ? text : text?.[locale] || text?.en || '';
  return { title: localized(factor?.name) || factor?.id || '', meaning: localized(factor?.description), example: '' };
}

const boundaryRows = [
  ['本项关注气候风险对业务的影响；减少温室气体排放见温室气体排放管理。', '本項關注氣候風險對業務的影響；減少溫室氣體排放見溫室氣體排放管理。', 'This topic concerns climate risks to operations. Reducing greenhouse gas emissions is covered by greenhouse gas emissions management.'],
  ['本项关注温室气体排放；燃料、电力等能源投入与使用另见能源管理。', '本項關注溫室氣體排放；燃料、電力等能源投入與使用另見能源管理。', 'This topic concerns greenhouse gas emissions. Fuel, electricity and other energy inputs and use are covered by energy management.'],
  ['本项关注能源使用与效率；相关温室气体排放另见温室气体排放管理。', '本項關注能源使用與效率；相關溫室氣體排放另見溫室氣體排放管理。', 'This topic concerns energy use and efficiency. Associated greenhouse gas emissions are covered by greenhouse gas emissions management.'],
  ['本项关注进入空气的污染物；水体和土壤污染分别判断。', '本項關注進入空氣的污染物；水體和土壤污染分別判斷。', 'Consider pollutants released into air here. Review water and soil pollution separately.'],
  ['本项关注污染物进入水体；取水、用水及水资源压力见水资源管理。', '本項關注污染物進入水體；取水、用水及水資源壓力見水資源管理。', 'Consider pollutants entering water here. Water withdrawal, use and scarcity are covered by water resources management.'],
  ['本项关注土壤受污染；进入空气或水体的污染物分别判断。', '本項關注土壤受污染；進入空氣或水體的污染物分別判斷。', 'Consider soil contamination here. Review pollutants entering air or water separately.'],
  ['本项关注生物和食品资源受到污染；物种生存状况另见物种影响管理。', '本項關注生物和食品資源受到污染；物種生存狀況另見物種影響管理。', 'This topic concerns contamination of organisms and food resources. Species condition is covered by effects on species.'],
  ['本项关注需关注物质的识别和管理；高度关注物质另有单独议题。', '本項關注需關注物質的識別和管理；高度關注物質另有獨立議題。', 'This topic concerns identifying and managing substances of concern. Substances of very high concern have a separate topic.'],
  ['本项聚焦高度关注物质的接触、使用及替代安排。', '本項聚焦高度關注物質的接觸、使用及替代安排。', 'Focus on exposure, use and substitution arrangements for substances of very high concern.'],
  ['本项聚焦微塑料的产生与释放；其他物质和废弃物另行判断。', '本項聚焦微塑料的產生與釋放；其他物質和廢棄物另行判斷。', 'Focus on the generation and release of microplastics. Review other substances and waste separately.'],
  ['本项关注水的取用、排放及水资源压力；污染物进入水体另见水污染。', '本項關注水的取用、排放及水資源壓力；污染物進入水體另見水污染。', 'Consider water withdrawal, use, discharge and scarcity here. Pollutants entering water are covered by water pollution.'],
  ['本项关注海洋资源的使用及相关影响；可按所熟悉的海运业务判断。', '本項關注海洋資源的使用及相關影響；可按所熟悉的海運業務判斷。', 'Focus on the use of and effects on marine resources, drawing on relevant shipping experience.'],
  ['本项关注造成生物多样性损失的压力；物种和生态系统的状态分别有对应议题。', '本項關注造成生物多樣性損失的壓力；物種和生態系統的狀態分別有對應議題。', 'Focus on pressures that drive biodiversity loss. Species condition and ecosystem condition have separate topics.'],
  ['本项关注物种数量和生存状况；生态系统的范围和状态另行判断。', '本項關注物種數量和生存狀況；生態系統的範圍和狀態另行判斷。', 'Focus on species populations and condition. Review ecosystem extent and condition separately.'],
  ['本项关注生态系统的范围和状态；企业依赖的自然服务另见生态系统服务。', '本項關注生態系統的範圍和狀態；企業依賴的自然服務另見生態系統服務。', 'Focus on ecosystem extent and condition. Natural services used by the business are covered by ecosystem services.'],
  ['本项关注自然环境提供的服务，以及企业对这些服务的依赖和影响。', '本項關注自然環境提供的服務，以及企業對這些服務的依賴和影響。', 'Focus on services provided by nature and the business’s dependence on and effects on them.'],
  ['本项关注投入业务的材料和资源；交付后的去向及废弃物分别判断。', '本項關注投入業務的材料和資源；交付後的去向及廢棄物分別判斷。', 'Focus on materials and resources entering operations. Review post-delivery outputs and waste separately.'],
  ['本项关注产品或服务交付后的资源去向、耐用性、再用和回收。', '本項關注產品或服務交付後的資源去向、耐用性、再用和回收。', 'Focus on resource destinations, durability, reuse and recycling after products or services are delivered.'],
  ['本项关注废弃物的减量、分类、储存、转运和处理。', '本項關注廢棄物的減量、分類、儲存、轉運和處理。', 'Focus on waste reduction, sorting, storage, transport and treatment.'],
  ['本项对象是本企业员工的工作条件；承运商等价值链工人另行判断。', '本項對象是本企業員工的工作條件；承運商等價值鏈工人另行判斷。', 'Consider working conditions for the own workforce here. Review carrier and other value-chain workers separately.'],
  ['本项对象是本企业员工的平等待遇与发展机会，包括培训、共融及反骚扰。', '本項對象是本企業員工的平等待遇與發展機會，包括培訓、共融及反騷擾。', 'Consider equal treatment and development opportunities for the own workforce, including training, inclusion and anti-harassment.'],
  ['本项对象是本企业员工的其他工作相关权利，包括童工、强迫劳动及隐私。', '本項對象是本企業員工的其他工作相關權利，包括童工、強迫勞動及私隱。', 'Consider other work-related rights of the own workforce, including child labour, forced labour and privacy.'],
  ['本项对象是承运商及其他价值链工人的工作条件；本企业员工另行判断。', '本項對象是承運商及其他價值鏈工人的工作條件；本企業員工另行判斷。', 'Consider working conditions for carrier and other value-chain workers. Review the own workforce separately.'],
  ['本项对象是价值链工人的平等待遇与发展机会。', '本項對象是價值鏈工人的平等待遇與發展機會。', 'Consider equal treatment and development opportunities for value-chain workers.'],
  ['本项对象是价值链工人的其他工作相关权利，包括童工、强迫劳动及隐私。', '本項對象是價值鏈工人的其他工作相關權利，包括童工、強迫勞動及私隱。', 'Consider other work-related rights of value-chain workers, including child labour, forced labour and privacy.'],
  ['本项对象是受物流活动影响的社区，关注生活条件与资源。', '本項對象是受物流活動影響的社區，關注生活條件與資源。', 'Consider communities affected by logistics activities, focusing on living conditions and resources.'],
  ['本项对象是社区的表达、集会和人权维护者等权利。', '本項對象是社區的表達、集會和人權維護者等權利。', 'Consider community rights concerning expression, assembly and human-rights defenders.'],
  ['本项对象是业务影响所及的原住民族，关注知情同意、自决与文化权利。', '本項對象是業務影響所及的原住民族，關注知情同意、自決與文化權利。', 'Consider affected indigenous peoples, focusing on informed consent, self-determination and cultural rights.'],
  ['本项对象是客户及最终用户的信息、隐私和表达权利；员工隐私另行判断。', '本項對象是客戶及最終用戶的資訊、私隱和表達權利；員工私隱另行判斷。', 'Consider information, privacy and expression rights of customers and end-users. Review workforce privacy separately.'],
  ['本项对象是客户及最终用户的健康和人身安全；员工职业安全另行判断。', '本項對象是客戶及最終用戶的健康和人身安全；員工職業安全另行判斷。', 'Consider customer and end-user health and personal safety. Review occupational safety separately.'],
  ['本项关注客户及最终用户的不歧视、服务可及性和负责任营销。', '本項關注客戶及最終用戶的不歧視、服務可及性和負責任營銷。', 'Focus on non-discrimination, service access and responsible marketing for customers and end-users.'],
  ['本项关注企业整体的行为准则、价值观及落实方式。', '本項關注企業整體的行為準則、價值觀及落實方式。', 'Focus on organisation-wide conduct standards, values and how they are put into practice.'],
  ['本项关注反映问题的渠道、调查安排与举报人保护。', '本項關注反映問題的渠道、調查安排與舉報人保護。', 'Focus on channels for raising concerns, investigation arrangements and protection of whistleblowers.'],
  ['本项聚焦涉及动物的业务活动及相应照护安排。', '本項聚焦涉及動物的業務活動及相應照護安排。', 'Focus on operations involving animals and the associated care arrangements.'],
  ['本项关注政治参与与游说活动的管理和记录。', '本項關注政治參與與遊說活動的管理和記錄。', 'Focus on managing and recording political engagement and lobbying activities.'],
  ['本项关注供应商选择、协作与付款；供应商工人的劳动条件另行判断。', '本項關注供應商選擇、協作與付款；供應商工人的勞動條件另行判斷。', 'Focus on supplier selection, coordination and payment. Review supplier workers’ working conditions separately.'],
  ['本项关注腐败与贿赂的预防、发现和培训；已确认事件的处理另行判断。', '本項關注貪腐與賄賂的預防、發現和培訓；已確認事件的處理另行判斷。', 'Focus on preventing and detecting corruption and bribery, including training. Review confirmed incidents separately.'],
  ['本项关注已确认腐败与贿赂事件的处理及结果。', '本項關注已確認貪腐與賄賂事件的處理及結果。', 'Focus on the handling and outcomes of confirmed corruption and bribery incidents.'],
];
const boundaries = Object.fromEntries(studyConfig.factors.map((factor, index) => [factor.esrs.key, boundaryRows[index]]));
export function managementBoundary(factor, locale = 'en') {
  return boundaries[factor?.esrs?.key]?.[localeIndex[locale] ?? 2] || '';
}
