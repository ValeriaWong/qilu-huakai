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
  { id: 'overtime', name: '加班 / 接私活', ap: 1, stress: +8, desc: '钱 +8 万，专业 +2。紧绷时收益 ×1.3。', fx: { money: 8, skill: 2 } },
  { id: 'study',    name: '系统学习', ap: 1, stress: +5, desc: '专业或表达 +5（× 专业系数 k）。', fx: { skill: 5 } },
  { id: 'social',   name: '社交局', ap: 1, stress: +6, desc: '人脉 +6。紧绷时反而 −3 压力。', fx: { network: 6 } },
  { id: 'health',   name: '健身 / 就医', ap: 1, stress: -12, desc: '健康 +5。唯一的健康正向来源。', fx: { health: 5 } },
  { id: 'family',   name: '陪家人 / 伴侣', ap: 1, stress: -8, desc: '关系线 +1，当年恢复斜率 +2。', fx: { family: 1 } },
  { id: 'opensrc',  name: '开源 / 社区 / 内容', ap: 1, stress: +3, desc: '影响力 +6。影响力 ≥50 后开始反向给钱。', fx: { influence: 6 } },
  { id: 'sidejob',  name: '兼职 / 副业', ap: 1, stress: +7, desc: '钱 +3 万。副业做满 3 年可转主线。', fx: { money: 3 } },
  { id: 'rest',     name: '躺平（刷手机）', ap: 1, stress: -5, desc: '无收益。解锁“喘息”：下一年压力额外 −5。', fx: {} },
];

// Generic yearly events (fast-forward years). Each has a small choice.
// minTurn = earliest turn (T2 = 19, T7 = 24) the event may fire. No weddings
// at 19, no department contests while still a student, no rent hikes in a dorm.
const YEAR_EVENTS = [
  { id: 'ev-race', minTurn: 5, title: '部门突然要搞一次内部竞赛', body: '赢了有奖金和曝光，输了也没什么损失，只是要搭进去两个周末。', options: [
    { text: '参加，拼一把', fx: { skill: 3, stress: 6 }, omen: '你报名的那天，组长多看了你一眼。' },
    { text: '算了，最近太累了', fx: { stress: -4 }, omen: '你退出的那天，工位对面的同事替你去了。' },
  ]},
  { id: 'ev-mentor', minTurn: 3, title: '一位前辈想带你做个小项目', body: '不算正式任务，但他说“做成了算你的”。', options: [
    { text: '跟他干', fx: { network: 4, skill: 2, stress: 4 }, omen: '他第一次在会上提你名字时，你正在改 bug。' },
    { text: '先把手头的事做完', fx: { skill: 1 }, omen: '他后来找了别人。那个项目上了公司的内网首页。' },
  ]},
  { id: 'ev-rent', minTurn: 4, title: '房东要涨租', body: '涨 800，要么接受，要么搬家，要么跟合租室友商量分摊。', options: [
    { text: '接受，省得折腾', fx: { money: -1, stress: 2 }, omen: '签完新合同的那个晚上，你算了一下存款。' },
    { text: '搬去远一点的地方', fx: { money: 1, stress: 5 }, omen: '新家的通勤多 40 分钟，你开始在地铁上看书。' },
  ]},
  { id: 'ev-friend', minTurn: 7, title: '大学同学结婚，请你去当伴郎 / 伴娘', body: '随份子 1000，还要请一天假。', options: [
    { text: '去，好好聚一次', fx: { money: -1, stress: -6, network: 2 }, omen: '婚礼上你们聊起了毕业那年的打算。' },
    { text: '发个红包，人就不去了', fx: { money: -1, network: -1 }, omen: '你看着朋友圈的照片，忽然有点想他们。' },
  ]},
  { id: 'ev-health', title: '体检报告上有个向上的箭头', body: '医生说问题不大，但建议你复查一次，别拖着。', options: [
    { text: '去复查，花半天时间', fx: { health: 3, stress: 2, money: -1 }, omen: '复查那天，医生说你来得正是时候。' },
    { text: '先放着，等有空再说', fx: { health: -3 }, omen: '那张报告你夹进了抽屉，没再打开过。' },
  ]},
  { id: 'ev-idea', input: true, title: '你有个赚钱的点子', body: '写下来，系统会按你的想法生成一条专属的线：启动成本、里程碑、风险与回报。做起来要时间、要钱、要人——但这条线是你自己的。', placeholder: '比如：我想创业做一个 AI 求职助手，帮人改简历、模拟面试。' },
];

// 赚钱点子的专属线：自由输入 → 关键词分类 → 一条可经营的项目线。
// 每条线 3 个里程碑，每年花 1 AP 推进，结算时掷骰判定；跑通后每年稳定 +2 万。
const VENTURE_ARCHETYPES = [
  { id: 'ai-tool', name: 'AI 工具创业', cost: 2, risk: '技术迭代快，获客成本高。',
    keys: ['ai', '人工智能', '智能', '求职', '简历', '面试', '助手', '工具', 'app', '小程序', '软件', '程序'],
    milestones: [
      { name: '做出最小版本', reward: { skill: 3 } },
      { name: '找到 100 个真实用户', reward: { influence: 6 } },
      { name: '收到第一笔付费', reward: { money: 6 } },
    ] },
  { id: 'content', name: '内容 / 自媒体', cost: 1, risk: '平台规则一变，流量就没了。',
    keys: ['视频', '直播', '公众号', '小红书', '抖音', '博主', '写作', '拍视频', '内容', '账号', '粉丝'],
    milestones: [
      { name: '连续更新 30 天', reward: { influence: 4 } },
      { name: '第一篇 10w+', reward: { influence: 8 } },
      { name: '接到第一个商单', reward: { money: 4 } },
    ] },
  { id: 'opensrc', name: '开源项目', cost: 0, risk: '维护成本高，没有直接收入。',
    keys: ['开源', 'github', '代码', '库', '框架', '插件', '工具库'],
    milestones: [
      { name: '发布 1.0', reward: { influence: 4 } },
      { name: '拿到 100 star', reward: { influence: 6, network: 3 } },
      { name: '被社区 / 大厂采用', reward: { network: 5, influence: 5 } },
    ] },
  { id: 'ecommerce', name: '电商 / 带货', cost: 3, risk: '压货风险，平台扣点。',
    keys: ['电商', '带货', '淘宝', '拼多多', '卖货', '开店', '选品', '进货'],
    milestones: [
      { name: '上架第一批货', reward: { money: 2 } },
      { name: '月销破 100 单', reward: { money: 5 } },
      { name: '做出一个爆款', reward: { money: 8, influence: 4 } },
    ] },
  { id: 'service', name: '技能服务 / 接单', cost: 0, risk: '时间换钱，天花板低。',
    keys: ['接单', '家教', '设计', '翻译', '咨询', '摄影', '写稿', '兼职'],
    milestones: [
      { name: '接到第一单', reward: { money: 2 } },
      { name: '攒下 5 个回头客', reward: { money: 3, network: 3 } },
      { name: '时薪翻倍', reward: { money: 5 } },
    ] },
  { id: 'generic', name: '创业项目', cost: 2, risk: '方向不明，先跑起来再说。',
    keys: [],
    milestones: [
      { name: '做出最小版本', reward: { skill: 3 } },
      { name: '找到第一批用户', reward: { influence: 4 } },
      { name: '收支打平', reward: { money: 5 } },
    ] },
];

// T5 毕业去向 (承诺 B). offer tier formula in engine.js.
const T5_JOBS = [
  { id: 'bigtech', name: '大厂', desc: '钱高，压力 +8/年。', money: 18, stress: 8 },
  { id: 'stable',  name: '体制内', desc: '稳，但影响力上限 40。', money: 9, stress: 2 },
  { id: 'hometown',name: '回老家', desc: '家庭线 +2，事业慢。', money: 7, stress: 1 },
  { id: 'startup', name: '创业公司', desc: '专业成长 ×1.5，但 3 年内倒闭率 35%。', money: 11, stress: 6 },
];

// T9 裁员之夜 (the 3-minute slice). Three decisions, first within 90s.
const T9_SLICE = {
  intro: '26 岁，周二晚上 21:47。你刚被优化。HR 的消息还停留在屏幕上：“明早 10 点，来一趟。”今晚要决定三件事。',
  decisions: [
    {
      id: 'call-laochen', title: '第一件事：给老陈打电话吗？',
      body: '老陈是你上一家公司的领导，去年跳去了一家大厂。他手里可能有内推名额，也可能只是客气。电话打过去，你就欠他一个人情。',
      options: [
        { text: '打，现在就打', fx: { network: 2, stress: -3 }, seal: '你拨通了老陈的电话。他接了，第一句话是：“我听说了。”', omen: '老陈在电话那头停顿了两秒。' },
        { text: '先发微信探探口风', fx: { network: 1 }, seal: '你发了一条微信：“陈总，最近还好吗？”他回了一个“在开会，晚点说”。', omen: '微信发出去之后，对方正在输入……又停了。' },
        { text: '不打，靠自己', fx: { stress: 2 }, seal: '你把手机扣在桌上。这个坎，你想自己迈过去。', omen: '手机黑屏之后，房间里只剩下空调的声音。' },
      ],
    },
    {
      id: 'hr-talk', title: '第二件事：明早 HR 谈话，三选一',
      body: 'HR 给了三个方案。你必须在走进会议室之前想好。每个方案都写好了代价，没有一个是白给的。',
      options: [
        { text: '接受 N+1，走人', fx: { money: 8, stress: 20 }, seal: '你签了 N+1。+8 万到账，空窗期开始，压力 +20。', omen: 'HR 说“公司感谢你的付出”时，没有看你的眼睛。' },
        { text: '内部转岗，降薪留下', fx: { skill: -1, stress: 8 }, seal: '你留下来了，但专业成长 −0.5/年——这条路走得慢，可它不断。', omen: '转岗的工位在走廊尽头，靠窗，但没人经过。' },
        { text: '仲裁', fx: { influence: 5, stress: 12 }, seal: '你决定仲裁。影响力 ±、行业口碑风险 30%——但你拿回了主动权。', omen: '仲裁申请提交的那一刻，你的手抖了一下。' },
      ],
    },
    {
      id: 'borrow-home', title: '第三件事：跟家里借 3 万吗？',
      body: '空窗期至少三个月。房租、社保、生活费加起来，3 万是个坎。家里不是没有，但开口的那一刻，有些东西就变了。',
      options: [
        { text: '借，跟家里开口', fx: { money: 3, family: -1, stress: -5 }, seal: '妈妈没问为什么，只说了一句：“卡号发来。”家庭线 −1——不是关系坏了，是你开始记账了。', omen: '转账到账的短信提示音，在深夜格外响。' },
        { text: '不借，自己扛', fx: { stress: 6 }, seal: '你没开口。这三个月会很难，但你想试试不靠家里能走多远。', omen: '你打开存款 App，看了一眼余额，又关上了。' },
        { text: '借一半，1.5 万', fx: { money: 1.5, stress: -2 }, seal: '你借了 1.5 万。一半靠家里，一半靠自己——这是你能接受的中间态。', omen: '妈妈多转了 5000，备注写着“别省着”。' },
      ],
    },
  ],
  outro: '三件事都决定了。承诺 C（裁员应对）已经封存，兑现从 T10 开始。这一夜的决定不会立刻给你答案——它们会在未来一到三年里，逐个找上门来。',
};

if (typeof module !== 'undefined') {
  module.exports = { DIFFICULTIES, OBSESSIONS, FAMILIES, TAG_KEYWORDS, ACTIONS, YEAR_EVENTS, T5_JOBS, T9_SLICE, VENTURE_ARCHETYPES };
}
