'use strict';
/**
 * Content pools for 《歧路花开》 v5.
 * All content is local and template-based: no network, no model call.
 * Numbers follow the v5 design doc (alipay-emerge-rpg-design-20261116.md).
 */

const DIFFICULTIES = {
  easy:     { name: '简单', recovery: -6, collapseRebound: -30, judgeMod: +10, lockedOptions: 0, note: '世界对你温和一点。恢复更快，判定更宽容。' },
  normal:   { name: '一般', recovery: -2, collapseRebound: -20, judgeMod: 0,  lockedOptions: 0, note: '不多不少，就是人生本来的样子。' },
  hard:     { name: '困难', recovery: -1, collapseRebound: -10, judgeMod: -5,  lockedOptions: 3, note: '社会资本那几条路，有三条不存在。' },
  nightmare:{ name: '噩梦', recovery: 0,  collapseRebound: -5,  judgeMod: -10, lockedOptions: 6, note: '“向家里借钱”“辞职回家休整”“找导师内推”——这几条路压根不存在。' },
};

const OBSESSIONS = [
  { id: 'money',   name: '经济独立', desc: '35 岁时不再为钱低头。' },
  { id: 'seen',    name: '被人看见', desc: '做出一件能署上自己名字的事。' },
  { id: 'home',    name: '回家',     desc: '离父母近一点，别让他们先老。' },
  { id: 'free',    name: '自由支配时间', desc: '时间是自己的，不是公司的。' },
  { id: 'love',    name: '一段稳的关系', desc: '有人一起扛，也有人等你回家。' },
  { id: 'health',  name: '身体不出问题', desc: '别在 35 岁之前把身体先交出去。' },
];

// Family types. Weights follow the design: 缺席类七成走倾向、三成走反例池
// (implemented as: 70% of the time the pool's typical fragments are used,
// 30% a "反例" fragment — e.g. the absent father is the one who backs you).
const FAMILIES = {
  model: {
    name: '模范父母', weight: 5,
    desc: '无条件的爱，父亲好，母亲也好。',
    money: 5, health: 85, stress: 10,
    lines: ['家庭', '父母', '经济', '城市', '一句判词'],
    card: {
      family: '父母都在身边，吵架也当面吵，和好也当面和好。',
      parents: '爸爸话不多，妈妈爱张罗，家里的大事都上桌谈。',
      money: '经济：中产，不富裕，但你从没为学费发过愁。',
      city: '城市：省会，离家三小时车程。',
      verdict: '你没得选的那部分，恰好是温和的那部分。',
    },
    fragments: [
      '小学三年级，你发烧到 39 度，妈妈半夜背你下楼打车，爸爸在后面拎着热水袋追。',
      '初二那年你考砸了，爸爸没骂你，只说了一句：下次把错题抄一遍给我看。',
      '你第一次离家上大学，妈妈在车站把煮好的鸡蛋塞进你包里，说到了就打电话。',
    ],
    counter: '高三那年，爸爸第一次在饭桌上说：志愿你自己定，我们兜底。',
  },
  absentFather: {
    name: '父亲缺席', weight: 30,
    desc: '父亲长期不在身边，或在身边也不管。',
    money: 2, health: 75, stress: 20,
    card: {
      family: '爸爸常年在外，一年回家两次，视频里永远在工地或出差的路上。',
      parents: '妈妈一个人扛起了家，脾气越来越急，对你的要求也越来越高。',
      money: '经济：紧巴，妈妈的工资要掰成三份花。',
      city: '城市：县城，离最近的大学城也要两个小时。',
      verdict: '你没得选的那部分，是从小就学会了不麻烦别人。',
    },
    fragments: [
      '你十岁那年给爸爸打电话，他说信号不好，只听到一句“好好听妈妈的话”。',
      '家长会永远是妈妈去，她坐在最后一排，认真记下老师说的每一句话。',
      '你学会了自己修水龙头、自己去医院、自己填表——因为等爸爸回来太慢了。',
    ],
    counter: '高考前一个月，爸爸突然回来了。他没说什么，只是每天早上五点起来给你做早饭。',
  },
  absentMother: {
    name: '母亲缺席', weight: 30,
    desc: '母亲长期不在身边，或在身边也情感缺席。',
    money: 2, health: 75, stress: 20,
    card: {
      family: '妈妈在你很小的时候就去外地打工了，一年回来一次。',
      parents: '爸爸沉默寡言，家里的事他很少过问，只管把饭做熟。',
      money: '经济：紧巴，爸爸的收入只够维持基本开销。',
      city: '城市：县城，妈妈打工的城市在地图另一端。',
      verdict: '你没得选的那部分，是很早就知道思念没有形状。',
    },
    fragments: [
      '你上小学时，每次收到妈妈寄来的包裹，都会先把信读三遍再拆礼物。',
      '爸爸不会扎头发，你小学六年一直留着最短的短发。',
      '你第一次来例假/变声，是同桌的妈妈发现的——你回家没敢跟爸爸说。',
    ],
    counter: '你高三那年，妈妈辞掉了外地的工作回来陪考。她说：这次我不走了。',
  },
  absentBoth: {
    name: '双缺席', weight: 20,
    desc: '父母都不在身边，由祖辈或亲戚带大。',
    money: 0, health: 70, stress: 25,
    card: {
      family: '父母都在外地，你跟着奶奶长大，逢年过节才见他们一面。',
      parents: '奶奶是你真正的监护人，她的话比父母的电话管用。',
      money: '经济：拮据，学费靠父母汇款和奶奶的退休金凑。',
      city: '城市：镇上，最近的高中有四十分钟车程。',
      verdict: '你没得选的那部分，是很早就明白：家是一个需要自己攒的地方。',
    },
    fragments: [
      '奶奶每天四点起床给你做早饭，她说：吃饱了才有力气读书。',
      '你第一次拿到奖学金，奶奶把奖状贴在墙上最显眼的位置。',
      '父母打电话来只问成绩，奶奶才会问你：今天累不累。',
    ],
    counter: '高考前，父母同时回来了。他们说：这次我们陪你考完。',
  },
  orphan: {
    name: '孤儿', weight: 8,
    desc: '无父母线，由其他监护人或机构抚养。',
    money: -3, health: 70, stress: 25,
    card: {
      family: '你没有父母，由福利院和后来的养父母抚养长大。',
      parents: '监护人对你很好，但你始终记得：这份好是别人给的，不是天生的。',
      money: '经济：助学贷款是你 18 岁的第一笔债务，−3 万。',
      city: '城市：你长大的城市，也是你最想离开的城市。',
      verdict: '你没得选的那部分，是连“家”这个词都要先学会拼。',
    },
    fragments: [
      '你第一次意识到自己和别人不一样，是小学的家长会——你的座位空着。',
      '养母给你织了一件毛衣，你穿了整个冬天，舍不得洗。',
      '你 16 岁就开始打零工，因为你想在 18 岁那年，第一次自己交学费。',
    ],
    counter: '福利院的李阿姨在你高考前写了一封信：你不是没人要，你是被很多人一起养大的。',
  },
  npd: {
    name: 'NPD 家庭', weight: 7,
    desc: '父母以自我为中心、情感操控、否认打压。只出现在困难 / 噩梦模式池里。',
    money: 3, health: 72, stress: 35,
    hardOnly: true,
    card: {
      family: '家里的规则是：父母永远是对的，你的感受不算数。',
      parents: '你考第一名，他们说“那是应该的”；你考砸了，他们说“你让我们丢人”。',
      money: '经济：不缺钱，但每一笔花销都要报账、都要听一句“我们为你付出了多少”。',
      city: '城市：大城市，表面光鲜，家里没人敢大声说话。',
      verdict: '你没得选的那部分，是很早就学会了先看脸色再开口。',
    },
    fragments: [
      '你拿了市里的奖，妈妈在亲戚面前说：这孩子从小就让我们操心。',
      '你第一次顶嘴，爸爸三天没跟你说话，妈妈说：你看你把你爸气成什么样。',
      '你学会了把真实的想法写进日记锁起来，因为说出来只会被改写。',
    ],
    counter: '有一年春节，妈妈突然说了一句：其实你小时候，我们也没做好。这句话你记了很久。',
  },
};

// Keyword -> tag mapping for 「照我的来」 (S4-A). Local, transparent:
// the player sees the tags 2s after writing.
const TAG_KEYWORDS = [
  { keys: ['县城', '小县城', '镇上', '农村', '村里'], tag: '小地方长大' },
  { keys: ['爸爸', '父亲', '我爸'], tag: '父亲在场' },
  { keys: ['妈妈', '母亲', '我妈'], tag: '母亲在场' },
  { keys: ['不管', '缺席', '不在', '出差', '打工'], tag: '父母缺席' },
  { keys: ['管得严', '什么都管', '高控制', '不许', '必须'], tag: '母亲高控制' },
  { keys: ['穷', '没钱', '紧巴', '拮据', '贷款'], tag: '经济紧张' },
  { keys: ['奶奶', '爷爷', '外婆', '外公'], tag: '祖辈带大' },
  { keys: ['打', '骂', '吵架', '冷战', '不说话'], tag: '家里常吵架' },
  { keys: ['下岗', '失业', '裁员', '破产'], tag: '家里遭过变故' },
  { keys: ['支持', '鼓励', '相信我', '兜底'], tag: '家里有人撑你' },
  { keys: ['孤儿', '没爸妈', '福利院'], tag: '无父母线' },
];

// Yearly actions (3 AP per year). stress = pressure delta, effects applied on use.
const ACTIONS = [
  { id: 'overtime', name: '加班 / 接私活', ap: 1, stress: +8, desc: '按阶段计酬：学生兼职 1 万，在职接单 3 万，专业 +2。硬撑（紧绷）多耗压力，不加钱。', fx: { money: 3, skill: 2 } },
  { id: 'study',    name: '系统学习', ap: 1, stress: +5, desc: '专业或表达 +5（× 专业系数 k）。', fx: { skill: 5 } },
  { id: 'social',   name: '社交局', ap: 1, stress: +6, desc: '人脉 +6。', fx: { network: 6 } },
  { id: 'health',   name: '健身 / 就医', ap: 1, stress: -12, desc: '健康 +5。唯一的健康正向来源。', fx: { health: 5 } },
  { id: 'family',   name: '陪家人 / 伴侣', ap: 1, stress: -8, desc: '关系线 +1，当年恢复斜率 +2。', fx: { family: 1 } },
  { id: 'opensrc',  name: '开源 / 社区 / 内容', ap: 1, stress: +3, desc: '影响力 +6。影响力 ≥50 后开始反向给钱。', fx: { influence: 6 } },
  { id: 'sidejob',  name: '兼职 / 副业', ap: 1, stress: +7, desc: '钱 +3 万。副业做满 3 年可转主线。', fx: { money: 3 } },
  { id: 'rest',     name: '躺平（刷手机）', ap: 1, stress: -5, desc: '无收益。就是喘口气，不产生下一年效果。', fx: {} },
];

// Generic yearly events (fast-forward years). Each has a small choice.
// Gates (ChatGPT audit 2026-11-16, v0.2): an event must pass THREE checks,
// not just age — minTurn/maxTurn, plus `requires` (student / employment /
// housing / hasVenture / family). Omens are present-tense facts, not
// predictions: only a sealed commitment's omen gets the 65% rule.
const YEAR_EVENTS = [
  { id: 'ev-aid', minTurn: 2, maxTurn: 4, requires: { student: true }, title: '奖助学金申请窗口快关闭了', body: '学校发布了一批奖助学金和勤工助学名额，你可能符合条件，但申请要准备证明材料，还可能得跟家里谈经济情况。', options: [
    { text: '申请，材料自己想办法凑', fx: { money: 1, express: 2, stress: 4 }, omen: '你交表的那天，辅导员说你的材料还差一张证明。' },
    { text: '算了，不折腾', fx: {}, omen: '申请截止那天，你在食堂听见有人在聊自己拿到了。' },
  ]},
  { id: 'ev-race', minTurn: 5, requires: { employment: 'employed' }, title: '部门征集内部创新项目', body: '公司准备办一次内部创新挑战赛，获选项目有展示机会和一定奖励。主管鼓励新人参加，但要占用两个周末，也不保证成果被采用。', options: [
    { text: '报名参与', fx: { skill: 3, stress: 6 }, omen: '你把名字写在了报名表最后一行。' },
    { text: '暂时不参加', fx: { stress: -4 }, omen: '你退出的那天，工位对面的同事替你去了。' },
  ]},
  { id: 'ev-mentor', minTurn: 3, variants: {
    student: { title: '一位研究生学长邀请你参加实验室的小项目', body: '他说如果顺利完成，可以在成果展示时注明你的贡献。但这个项目目前没有经费，也可能占用期末复习时间。', options: [
      { text: '跟他干', fx: { network: 4, skill: 2, stress: 4 }, omen: '他第一次在组会上提你名字时，你正在改数据。' },
      { text: '先把手头的事做完', fx: { skill: 1 }, omen: '他后来找了别人。那个项目在学院的成果展上拿了个小奖。' },
    ]},
    work: { title: '一位资深同事邀请你参加一个不在计划里的项目', body: '他口头承诺会认可你的贡献，但团队还没有明确项目分工和成果署名方式。', options: [
      { text: '跟他干', fx: { network: 4, skill: 2, stress: 4 }, omen: '他第一次在会上提你名字时，你正在改 bug。' },
      { text: '先把手头的事做完', fx: { skill: 1 }, omen: '他后来找了别人。那个项目上了公司的内网首页。' },
    ]},
  }},
  { id: 'ev-intern', minTurn: 3, maxTurn: 6, requires: { student: true }, title: '实习负责人临时加了一项任务', body: '实习负责人希望你在原定工作之外完成一个项目，却没有明确报酬、时间或成果归属。', options: [
    { text: '接下来，干完再说', fx: { skill: 3, stress: 6 }, omen: '你接下任务的那天，负责人拍了拍你的肩膀。' },
    { text: '先谈清楚再接', fx: { express: 2, stress: 2 }, omen: '你问了一句“这个算谁的”，会议室安静了两秒。' },
    { text: '拒绝，守住边界', fx: { network: -1, stress: -2 }, omen: '你说完“手头的事还没做完”，负责人点了点头，没再说什么。' },
  ]},
  { id: 'ev-rent', minTurn: 4, requires: { housing: 'rent' }, title: '房东提出续租涨价', body: '租约还有一个月到期。房东提出新合同每月涨租 800 元。你可以续租、寻找更远的房子，或者与合租室友商量重新分摊费用。', options: [
    { text: '续租，省得折腾', fx: { money: -1, stress: 2 }, omen: '签完新合同的那个晚上，你算了一下存款。' },
    { text: '搬去远一点的地方', fx: { money: -0.5, stress: 5 }, omen: '新家的通勤多 40 分钟，你开始在地铁上看书。' },
    { text: '跟室友商量重新分摊', fx: { stress: 2, network: 1 }, omen: '你们在客厅开了个小会，算了一晚上账。' },
  ]},
  { id: 'ev-friend', minTurn: 7, title: '大学同学发来了婚礼邀请', body: '大学时关系不错的同学下个月结婚，邀请你去参加婚礼。预计礼金 1000 元，如果赴宴，还需要交通费和一天假期。', options: [
    { text: '去，好好聚一次', fx: { money: -0.1, stress: -4, network: 2 }, omen: '婚礼上你们聊起了毕业那年的打算。' },
    { text: '发个红包，人就不去了', fx: { money: -0.1 }, omen: '你看着朋友圈的照片，忽然有点想他们。' },
    { text: '私下解释最近的难处，约改天见', fx: { stress: 2 }, omen: '对方回了一句“没事，等你有空”。' },
  ]},
  { id: 'ev-health', title: '体检报告上出现了需要关注的指标', body: '体检有一项指标超出参考范围。医生建议结合个人情况复查，以确认它是暂时波动还是需要进一步处理。', options: [
    { text: '按建议复查', fx: { health: 1, stress: 2, money: -0.2 }, omen: '复查的报告要等三天才能取。' },
    { text: '先问清复查时限和注意事项', fx: { stress: 1 }, omen: '医生在你的报告上圈了一个日期。' },
    { text: '暂时不安排', fx: { health: -1 }, omen: '那张报告你夹进了抽屉，没再打开过。' },
  ]},
  { id: 'ev-boundary', minTurn: 5, maxTurn: 14, requires: { employment: 'employed' }, title: '工作群深夜响了', body: '晚上 11 点，领导在群里要求明早提交一份临时报告。你已经连续几天没有休息好。', options: [
    { text: '爬起来做完', fx: { stress: 8, network: 1 }, omen: '你交报告的时候，天刚亮。' },
    { text: '回一句“明天一早交”', fx: { express: 2, stress: 2 }, omen: '领导回了个“好”，群里没人再说话。' },
    { text: '不回，明早再说', fx: { stress: -2 }, omen: '你把手机调成静音，睡了一个整觉。' },
  ]},
  { id: 'ev-cofounder', minTurn: 4, maxTurn: 15, requires: { hasVenture: true }, title: '朋友说，赚了钱再谈分成', body: '一位熟人想跟你一起经营项目，但希望先开始工作，等盈利后再商量分工和收益分配。', options: [
    { text: '先谈好分成再干', fx: { network: 2, stress: 2 }, omen: '你们在白板上写下了第一版分成比例。' },
    { text: '先干活，赚钱了再说', fx: { money: -1, stress: 4 }, omen: '你开始干活的那天，对方说“你放心”。' },
    { text: '拒绝，守住自己的节奏', fx: { stress: -2 }, omen: '对方笑了笑，说“以后有机会再合作”。' },
  ]},
  { id: 'ev-move', minTurn: 5, maxTurn: 14, title: '一个机会要求你搬到另一座城市', body: '你收到一个外地的工作、进修或合作机会，可能改善职业发展，却意味着重新安排住房、现有关系和生活成本。', options: [
    { text: '去，换个城市重新开始', fx: { money: -2, network: 3, stress: 6 }, omen: '你拖着行李箱站在新城市的地铁站口。' },
    { text: '不去，守住现在的生活', fx: {}, omen: '你把那封邀约邮件存进了收藏夹。' },
    { text: '先去看看，再决定', fx: { express: 1, stress: 2 }, omen: '你订了一张周末的车票。' },
  ]},
  { id: 'ev-care', minTurn: 8, maxTurn: 17, requires: { family: true }, title: '有人开始需要你的照顾', body: '一位与你关系重要的人近期需要持续帮助，而你手头也有无法轻易放下的工作与生活安排。', options: [
    { text: '接过来自己照顾', fx: { stress: 8, family: 1 }, omen: '你把自己的日程表重新排了一遍。' },
    { text: '请人帮忙，分摊费用', fx: { money: -2, family: 1 }, omen: '护工来的第一天，你在门口站了很久。' },
    { text: '暂时顾不上，先稳住自己', fx: { family: -1, stress: 2 }, omen: '电话那头沉默了几秒，说“你先忙”。' },
  ]},
  { id: 'ev-idea', input: true, title: '你有个赚钱的点子', body: '写下来，系统会按你的想法生成一条专属的线：启动成本、里程碑、风险与回报。做起来要时间、要钱、要人——但这条线是你自己的。', placeholder: '比如：我想创业做一个 AI 求职助手，帮人改简历、模拟面试。' },
];

// 赚钱点子的专属线：自由输入 → 关键词分类 → 一条可经营的项目线。
// v0.2 (ChatGPT audit 2026-11-16): each archetype has its own relevant
// attribute, running income and completion reward — open source does NOT pay
// cash; a running line is not a flat +2 for everyone. `validation` is the
// free first step for players who can't afford the startup cost yet.
const VENTURE_ARCHETYPES = [
  { id: 'ai-tool', name: 'AI 工具创业', cost: 2, attr: 'skill', risk: '技术迭代快，获客成本高。',
    validation: '访谈 10 个潜在用户，确认他们真的会为这个付费。',
    running: { money: 3 }, complete: { money: 5, influence: 5 },
    keys: ['ai', '人工智能', '智能', '求职', '简历', '面试', '助手', '工具', 'app', '小程序', '软件', '程序'],
    milestones: [
      { name: '做出可测试原型', reward: { skill: 3 } },
      { name: '找到真实用户并获得付费反馈', reward: { influence: 6 } },
      { name: '建立可维护的产品与收入渠道', reward: { money: 6 } },
    ] },
  { id: 'content', name: '内容 / 自媒体', cost: 0.5, attr: 'express', risk: '平台规则一变，流量就没了。',
    validation: '连更两周，看有没有人真的留下来。',
    running: { money: 2 }, complete: { money: 4, influence: 6 },
    keys: ['视频', '直播', '公众号', '小红书', '抖音', '博主', '写作', '拍视频', '内容', '账号', '粉丝'],
    milestones: [
      { name: '持续发布并观察受众', reward: { influence: 4 } },
      { name: '获得第一笔有效商业收入', reward: { influence: 8 } },
      { name: '形成稳定内容与收入模式', reward: { money: 4 } },
    ] },
  { id: 'opensrc', name: '开源项目', cost: 0, attr: 'skill', risk: '维护成本高，没有直接收入。',
    validation: '把最小可用的版本发出来，看有没有人真的用。',
    running: { influence: 3 }, complete: { influence: 8, network: 3 },
    keys: ['开源', 'github', '代码', '库', '框架', '插件', '工具库'],
    milestones: [
      { name: '发布可复用作品和许可证', reward: { influence: 4 } },
      { name: '建立真实使用者或贡献者群体', reward: { influence: 6, network: 3 } },
      { name: '获得赞助、服务收入或其他可持续支持', reward: { network: 5, influence: 5 } },
    ] },
  { id: 'ecommerce', name: '电商 / 带货', cost: 3, attr: 'network', risk: '压货风险，平台扣点。',
    validation: '小批量拿 20 件货，测测真实转化和退货率。',
    running: { money: 4 }, complete: { money: 6, influence: 4 },
    keys: ['电商', '带货', '淘宝', '拼多多', '卖货', '开店', '选品', '进货'],
    milestones: [
      { name: '小批量选品测试', reward: { money: 2 } },
      { name: '完成真实订单及售后', reward: { money: 5 } },
      { name: '单位经济模型合理，建立稳定复购', reward: { money: 8, influence: 4 } },
    ] },
  { id: 'service', name: '技能服务 / 接单', cost: 0, attr: 'express', risk: '时间换钱，天花板低。',
    validation: '做一份作品集，拿到第一位愿意试单的客户。',
    running: { money: 3 }, complete: { money: 5, network: 3 },
    keys: ['接单', '家教', '设计', '翻译', '咨询', '摄影', '写稿', '兼职'],
    milestones: [
      { name: '完成作品集与服务说明', reward: { money: 2 } },
      { name: '获得第一位付费客户', reward: { money: 3, network: 3 } },
      { name: '实现重复接单或转介绍', reward: { money: 5 } },
    ] },
  { id: 'knowledge', name: '知识产品', cost: 1, attr: 'express', risk: '做出来容易，卖出去难，售后也占时间。',
    validation: '做一节免费样课，看有没有人愿意为完整版付费。',
    running: { money: 2 }, complete: { money: 5, influence: 5 },
    keys: ['课程', '电子书', '资料', '培训', '教学', '训练营'],
    milestones: [
      { name: '制作样品并验证需求', reward: { express: 3 } },
      { name: '拿到第一笔真实付费', reward: { money: 3 } },
      { name: '稳定交付并处理后续更新与服务', reward: { money: 5, influence: 3 } },
    ] },
  { id: 'local', name: '本地实体经营', cost: 5, attr: 'network', risk: '租金、设备、许可，样样都要先付钱。',
    validation: '在目标地段摆一周摊，测客流和真实客单价。',
    running: { money: 5 }, complete: { money: 8 },
    keys: ['奶茶', '餐饮', '咖啡', '花店', '工作室', '维修', '理发', '小店'],
    milestones: [
      { name: '验证地点、客群与成本', reward: { network: 3 } },
      { name: '合规开业并完成首批交易', reward: { money: 3 } },
      { name: '现金流能覆盖持续经营成本', reward: { money: 8 } },
    ] },
  { id: 'generic', name: '创业项目', cost: 2, attr: 'skill', risk: '方向不明，先跑起来再说。',
    validation: '找 5 个可能付钱的人聊聊，他们到底为什么需要这个。',
    running: { money: 2 }, complete: { money: 5, influence: 5 },
    keys: [],
    milestones: [
      { name: '做出最小版本', reward: { skill: 3 } },
      { name: '找到第一批用户', reward: { influence: 4 } },
      { name: '收支打平', reward: { money: 5 } },
    ] },
];

// Theme tags (second classification layer, v0.2): revenue model (archetype)
// + theme, so "AI 求职助手" is software × AI × 求职, not just "AI 工具".
const THEME_KEYWORDS = [
  { keys: ['ai', '人工智能', '智能'], tag: 'AI' },
  { keys: ['求职', '简历', '面试'], tag: '求职' },
  { keys: ['教育', '学习', '考试', '考研'], tag: '教育' },
  { keys: ['法律', '合同', '仲裁'], tag: '法律' },
  { keys: ['金融', '理财', '股票'], tag: '金融' },
  { keys: ['宠物', '狗', '猫'], tag: '宠物' },
  { keys: ['游戏'], tag: '游戏' },
  { keys: ['硬件', '单片机', '机器人'], tag: '硬件' },
  { keys: ['摄影', '拍照'], tag: '摄影' },
  { keys: ['留学', '出国'], tag: '留学' },
  { keys: ['美食', '做饭', '烘焙'], tag: '美食' },
  { keys: ['健康', '健身', '运动'], tag: '健康' },
  { keys: ['音乐', '唱歌'], tag: '音乐' },
];

// Gaokao regions (v0.4). Start with Shandong — the game is named Qilu.
// Policy verified 2026-11-16 from the 2026 Shandong admission rules
// (省招考院 2026-06-25: 特招线 525, 一段线 442, 二段线 150) and the 2026
// 夏季高考工作实施办法: 3+3, 750 total, 常规批 96 parallel
// "专业+学校" choices, 特殊类型批 cancelled from 2026. These lines are
// REAL 2026 numbers. Per-major lines below are GAME reference lines
// (offsets above 一段线), not real admission data. Add a province by
// adding one entry here.
const GAOKAO_REGIONS = {
  shandong: {
    id: 'shandong', name: '山东', year: 2026,
    model: '3+3', total: 750,
    line1: 442, specialLine: 525, line2: 150,
    batchName: '常规批', batchChoices: 96, batchUnit: '“专业+学校”平行志愿',
    note: '普通类分提前批+常规批；2026年起取消特殊类型批；常规批3次填报，每次最多96个“专业+学校”平行志愿；一段线按本科计划1:1.2划定。',
  },
  // Northeast (v0.5). All three run 3+1+2, so the game uses the 物理类
  // lines (历史类 lines are in each note; subject-track choice is not
  // modelled yet). Batch counts verified 2026-11-16 from the 2026
  // provincial admission rules.
  liaoning: {
    id: 'liaoning', name: '辽宁', year: 2026,
    model: '3+1+2', total: 750, track: '物理类',
    line1: 344, specialLine: 508, line2: 150,
    batchName: '本科批', batchChoices: 112, batchUnit: '“专业+学校”平行志愿',
    note: '普通类分本科提前批、本科批、高职（专科）提前批、高职（专科）批；按物理类线（历史类本科 442、特殊类型 527）；本科批 112 个“专业+学校”平行志愿。',
  },
  jilin: {
    id: 'jilin', name: '吉林', year: 2026,
    model: '3+1+2', total: 750, track: '物理类',
    line1: 321, specialLine: 473, line2: 160,
    batchName: '本科批', batchChoices: 50, batchUnit: '院校专业组平行志愿',
    note: '普通类分提前批、本科批、专科批；按物理类线（历史类本科 343、特殊类型 478）；本科批 50 个院校专业组平行志愿。',
  },
  heilongjiang: {
    id: 'heilongjiang', name: '黑龙江', year: 2026,
    model: '3+1+2', total: 750, track: '物理类',
    line1: 340, specialLine: 464, line2: 150,
    batchName: '本科批', batchChoices: 45, batchUnit: '院校专业组平行志愿',
    note: '普通类分本科提前批、本科批、高职（专科）提前批、高职（专科）批；按物理类线（历史类本科 385、特殊类型 466）；本科批 45 个院校专业组平行志愿。',
  },
};
const GAOKAO_DEFAULT_REGION = 'shandong';
// Major reference lines: offset above 一段线. Game simplification, NOT
// real admission data. 艺术设计 sits on 一段线 so a player above the
// line always has at least one reachable major (the 调剂 floor).
const MAJOR_LINE_OFFSETS = {
  '临床医学': 160, '计算机': 140, '金融': 120, '法学': 110, '会计': 90,
  '新闻传播': 70, '师范': 70, '土木': 50, '英语': 50, '艺术设计': 0,
};
const MAJOR_LINE_DEFAULT_OFFSET = 60;
// Ad boost: +10 per watch, max 3 watches per run (+30 max). Simulated
// 5s view in the demo (no real ad SDK wired); labelled 演示版 in the UI.
const AD_BOOST_POINTS = 10;
const AD_BOOST_MAX = 3;
const AD_VIEW_MS = 5000;

// T1 major quick picks (tap to fill the input; the player may also type
// any major). The only major word the game showed before v0.3.1 was 会计,
// and only as a childhood omen line ("你妈说隔壁家孩子学了会计") —
// there were no major options at all.
const T1_MAJORS = ['计算机', '临床医学', '法学', '金融', '会计', '新闻传播', '土木', '英语', '艺术设计', '师范'];
const T5_JOBS = [
  { id: 'bigtech', name: '大厂', desc: '钱高，压力 +8/年。', money: 18, stress: 8 },
  { id: 'stable',  name: '体制内', desc: '稳，但影响力上限 40。', money: 9, stress: 2 },
  { id: 'hometown',name: '回老家', desc: '家庭线 +2，事业慢。', money: 7, stress: 1 },
  { id: 'startup', name: '创业公司', desc: '专业成长 ×1.5，但 3 年内倒闭率 35%。', money: 11, stress: 6 },
];

// T9 裁员之夜 (the 3-minute slice). Three decisions, first within 90s.
// v0.2 (ChatGPT audit 2026-11-16): the slice is now framed PRE-notice —
// HR has scheduled a talk, no formal dismissal notice has been served.
// The layoff die (H2) is sealed when the slice is entered, not by these
// decisions. N+1 is not a flat label: compensation derives from tenure and
// salary (N by years; the +1 代通知金 only for specific 劳动合同法 Art. 40
// cases). Arbitration is a statutory right — no 口碑 penalty attached.
const T9_SLICE = {
  intro: '26 岁，周二晚上 21:47。部门在调整预算，主管说公司可能取消部分岗位。HR 约你明早 10 点谈话，目前尚未送达正式解除通知。今晚要决定三件事。',
  decisions: [
    {
      id: 'call-laochen', title: '第一件事：今晚找谁聊聊？',
      body: '老陈是你两年前合作过的直属领导，后来跳槽到另一家企业。你们偶尔保持联系，他曾经说过，有合适机会可以帮你推荐。现在，你不知道这句话还有多少分量。',
      options: [
        { text: '打电话给老陈', fx: { network: 2, stress: -3 }, seal: '你拨通了老陈的电话。他接了，第一句话是：“我听说了。”', omen: '老陈在电话那头停顿了两秒。' },
        { text: '先发微信探探口风', fx: { network: 1 }, seal: '你发了一条微信：“陈总，最近还好吗？”他回了一个“在开会，晚点说”。', omen: '微信发出去之后，对方正在输入……又停了。' },
        { text: '先准备简历和证据材料', fx: { skill: 1, stress: 2 }, seal: '你打开电脑，把简历和这三年的项目清单重新整理了一遍。', omen: '你翻到一张旧工牌，照片上的你比现在瘦一点。' },
      ],
    },
    {
      id: 'hr-talk', title: '第二件事：明早 HR 谈话，你想怎么谈？',
      body: '解除补偿不是统一价：经济补偿按本单位工作年限算 N，额外一个月工资的代通知金只适用于《劳动合同法》第四十条的特定解除情形，不是所有裁员都有 N+1。内部转岗需要有真实可用的岗位，改合同也要协商一致。申请仲裁是法定权利，不收费，不会因为维权本身损害你的行业口碑。',
      options: [
        { text: '先了解解除依据和补偿方案', fx: { stress: 5 }, seal: '你决定先问清楚：解除的依据是什么，补偿按什么算。', omen: '你把劳动合同从抽屉里翻了出来。' },
        { text: '争取内部转岗', fx: { stress: 10 }, seal: '你决定争取内部转岗。但有没有真实岗位、降薪多少，都要谈了才知道。', omen: '你想起走廊尽头那个空了两个月的工位。' },
        { text: '要求时间审阅文件', fx: { stress: 5 }, seal: '你决定不现场签字：先把文件拿回来，慢慢看。', omen: 'HR 点了点头，说“可以，明天下午之前给我答复”。' },
      ],
    },
    {
      id: 'borrow-home', title: '第三件事：跟家里借钱吗？',
      body: '空窗期至少三个月。房租、社保、生活费加起来，3 万是个坎。家里不是没有，但开口的那一刻，有些东西就变了。具体借多少，看你手头有多少钱——系统会按你的存款算一个缺口。',
      dynamic: 'borrow', // options rendered from the player's cash (see sliceBorrowOptions); statics below are the fallback
      options: [
        { text: '借，跟家里开口', fx: { money: 3, family: -1, stress: -5 }, seal: '妈妈没问为什么，只说了一句：“卡号发来。”家庭线 −1——不是关系坏了，是你开始记账了。', omen: '转账到账的短信提示音，在深夜格外响。' },
        { text: '不借，自己扛', fx: { stress: 6 }, seal: '你没开口。这三个月会很难，但你想试试不靠家里能走多远。', omen: '你打开存款 App，看了一眼余额，又关上了。' },
        { text: '借一半，1.5 万', fx: { money: 1.5, stress: -2 }, seal: '你借了 1.5 万。一半靠家里，一半靠自己——这是你能接受的中间态。', omen: '妈妈多转了 5000，备注写着“别省着”。' },
      ],
    },
  ],
  outro: '三件事都决定了。承诺 C（裁员应对）已经封存，兑现从 T10 开始。至于裁员本身——那颗骰子在今晚开始前就掷好了，结局在下面。',
};

if (typeof module !== 'undefined') {
  module.exports = { DIFFICULTIES, OBSESSIONS, FAMILIES, TAG_KEYWORDS, ACTIONS, YEAR_EVENTS, T1_MAJORS, GAOKAO_REGIONS, GAOKAO_DEFAULT_REGION, MAJOR_LINE_OFFSETS, MAJOR_LINE_DEFAULT_OFFSET, AD_BOOST_POINTS, AD_BOOST_MAX, AD_VIEW_MS, T5_JOBS, T9_SLICE, VENTURE_ARCHETYPES, THEME_KEYWORDS };
}
