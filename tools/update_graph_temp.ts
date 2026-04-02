import { KnowledgeGraphManager } from './knowledge-graph.js';

const topicDir = '/Users/mayu/.cc-switch/skills/insight-probe/temp/史前大洪水_202603282136';
const kgm = new KnowledgeGraphManager('', topicDir);
kgm.load();

// 添加大洪水百科发现
const f1 = kgm.addFindingNode(
  '大洪水是世界多民族共同神话传说',
  ['topic_1'],
  {
    metadata: {
      entities: [
        { name: '美索不达米亚', type: '地点' },
        { name: '希腊', type: '地点' },
        { name: '印度', type: '地点' },
        { name: '中国', type: '地点' },
        { name: '玛雅', type: '地点' },
        { name: '南岛', type: '地点' }
      ],
      round: 1
    }
  }
);

// 添加吉尔伽美什史诗发现
const f2 = kgm.addFindingNode(
  '大洪水神话最早版本见于苏美尔文明吉尔伽美什史诗',
  ['topic_1'],
  {
    metadata: {
      entities: [
        { name: '吉尔伽美什史诗', type: '概念' },
        { name: '苏美尔', type: '地点' },
        { name: '乌特纳匹什提姆', type: '人物' },
        { name: '恩基', type: '人物' },
        { name: '恩利爾', type: '人物' }
      ],
      round: 1
    }
  }
);

// 添加希腊神话发现
const f3 = kgm.addFindingNode(
  '希腊神话中杜卡利翁和皮拉是洪水幸存者',
  ['topic_1'],
  {
    metadata: {
      entities: [
        { name: '杜卡利翁', type: '人物' },
        { name: '皮拉', type: '人物' },
        { name: '宙斯', type: '人物' },
        { name: '帕纳塞斯山', type: '地点' }
      ],
      round: 1
    }
  }
);

// 添加圣经/挪亚方舟发现
const f4 = kgm.addFindingNode(
  '圣经记载挪亚方舟故事，方舟尺寸约133.5×22.3×13.4米',
  ['topic_1'],
  {
    metadata: {
      entities: [
        { name: '挪亚', type: '人物' },
        { name: '挪亚方舟', type: '概念' },
        { name: '亚伯拉罕诸教', type: '概念' }
      ],
      round: 1
    }
  }
);

// 添加中国洪水神话发现
const f5 = kgm.addFindingNode(
  '中国传说包含共工触不周山、女娲补天、大禹治水等洪水相关神话',
  ['topic_1'],
  {
    metadata: {
      entities: [
        { name: '共工', type: '人物' },
        { name: '祝融', type: '人物' },
        { name: '不周山', type: '地点' },
        { name: '女娲', type: '人物' },
        { name: '大禹', type: '人物' },
        { name: '鲧', type: '人物' },
        { name: '大禹治水', type: '事件' }
      ],
      round: 1
    }
  }
);

// 添加台湾原住民洪水传说发现
const f6 = kgm.addFindingNode(
  '台湾多个原住民民族都有大洪水传说，包括泰雅族、阿美族、邹族、布农族等',
  ['topic_1'],
  {
    metadata: {
      entities: [
        { name: '泰雅族', type: '组织' },
        { name: '阿美族', type: '组织' },
        { name: '邹族', type: '组织' },
        { name: '布农族', type: '组织' },
        { name: '巴宰族', type: '组织' },
        { name: '达悟族', type: '组织' }
      ],
      round: 1
    }
  }
);

// 添加考古证据发现
const f7 = kgm.addFindingNode(
  '考古学家伦纳德·伍利在乌尔城王族墓葬下发现约二米厚的洪水淤泥沉积层',
  ['topic_1'],
  {
    metadata: {
      entities: [
        { name: '伦纳德·伍利', type: '人物' },
        { name: '乌尔', type: '地点' },
        { name: '美索不达米亚', type: '地点' }
      ],
      round: 1
    }
  }
);

// 添加未回答的问题来驱动后续搜索
kgm.addQuestionNode('大洪水传说是否有真实地质学证据？', 'unanswered');
kgm.addQuestionNode('各文化大洪水神话之间是否有传播关系？', 'unanswered');
kgm.addQuestionNode('黑海洪水假说是什么？', 'unanswered');
kgm.addQuestionNode('史前大洪水的地质年代是什么时候？', 'unanswered');

kgm.save();
console.log('Knowledge graph updated with findings and questions');