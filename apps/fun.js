import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import _ from 'lodash'
import { Config } from '../components/index.js'
import { common, uploadRecord, QQApi, funApi, memes } from '../model/index.js'
import { successImgs, faildsImgs, heisiType, pandadiuType } from '../constants/fun.js'

/** API请求错误文案 */
const API_ERROR = '❎ 出错辣，请稍后重试'
/** 未启用文案 */
const SWITCH_ERROR = '主人没有开放这个功能哦(＊／ω＼＊)'
/** 开始执行文案 */
const START_EXECUTION = '椰奶产出中......'

const picapis = Config.getConfig('picApi')
/** 解析匹配模式 */
let picApiKeys = []
_.forIn(picapis, (values, key) => {
  let mode = values.mode !== undefined ? values.mode : picapis.mode
  key = key.split('|').map(item => mode ? '^' + item + '$' : item).join('|')
  picApiKeys.push(key)
})

const apiReg = new RegExp(`(${picApiKeys.join('|')}|^jktj$|^接口统计$)`)

export class Fun extends plugin {
  constructor () {
    super({
      name: '椰奶娱乐',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#唱歌$',
          fnc: 'Sing'
        },
        {
          reg: '^#支付宝到账.*$',
          fnc: 'ZFB'
        },
        {
          reg: '^#(([\u4e00-\u9fa5]{2,6})-)?([\u4e00-\u9fa5]{2,6})?翻译(.*)$',
          fnc: 'youdao'
        },
        {
          reg: '^#?(我要|给我)?(资料卡)?(点赞|赞我)$',
          fnc: 'thumbUp'
        },
        {
          reg: 'github.com/[a-zA-Z0-9-]{1,39}/[a-zA-Z0-9_-]{1,100}',
          fnc: 'GH'
        },
        {
          reg: '^#?coser$',
          fnc: 'coser'
        },
        // {
        //   reg: `^#?来点(${Object.keys(heisiType).join('|')})$`,
        //   fnc: 'heisiwu'
        // },
        {
          reg: '^#?铃声搜索.*$',
          fnc: 'lingsheng'
        },
        {
          reg: '^#?半次元话题$',
          fnc: 'bcyTopic'
        },
        {
          reg: apiReg,
          fnc: 'picture'
        },
        // {
        //   reg: '^#?来点神秘图(\\d+|s.*)?$',
        //   fnc: 'mengdui'
        // },
        {
          reg: `^#(${Object.keys(pandadiuType).join('|')})?acg.*$`,
          fnc: 'acg'
        },
        {
          reg: `^#来点(${Object.keys(funApi.xiurenTypeId).join('|')})$`,
          fnc: 'xiuren'
        }

      ]
    })
  }

  /** 随机唱鸭 */
  async Sing (e) {
    let data = await funApi.randomSinging()
    if (data.error) return e.reply(data.error)
    await e.reply(await uploadRecord(data.audioUrl, 0, false))
    await e.reply(data.lyrics)
  }

  /** 支付宝语音 */
  async ZFB (e) {
    let amount = parseFloat(e.msg.replace(/#|支付宝到账|元|圆/g, '').trim())

    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return e.reply('你觉得这河里吗！！', true)

    if (!(amount >= 0.01 && amount <= 999999999999.99)) {
      return e.reply('数字大小超出限制，支持范围为0.01~999999999999.99')
    }
    e.reply([segment.record(`https://mm.cqu.cc/share/zhifubaodaozhang/mp3/${amount}.mp3`)])
  }

  /** 有道翻译 */
  async youdao (e) {
    const msg = e.msg.match(/#(([\u4e00-\u9fa5]{2,6})-)?([\u4e00-\u9fa5]{2,6})?翻译(.*)/)
    // 如果是在群聊中回复，则获取上一条消息作为翻译内容
    if (e.source) {
      const source = e.isGroup
        ? (await e.group.getChatHistory(e.source.seq, 1)).pop()
        : (await e.friend.getChatHistory(e.source.time, 1)).pop()

      msg[4] = source.message
        .filter(item => item.type === 'text')
        .map(item => item.text).join('')
    }
    const results = await funApi.youdao(msg[4], msg[3], msg[2])
    e.reply(results, true)
  }

  /** 点赞 */
  async thumbUp (e) {
    if ((e.bot ?? Bot).config.platform == 3) {
      return logger.error(`${e.logFnc}手表协议暂不支持点赞请更换协议后重试`)
    }
    /** 判断是否为好友 */
    let isFriend = await (e.bot ?? Bot).fl.get(e.user_id)
    let allowLikeByStrangers = Config.whole.Strangers_love
    if (!isFriend && !allowLikeByStrangers) return e.reply('不加好友不点🙄', true)

    /** 执行点赞 */
    let n = 0
    let failsMsg = '今天已经点过了，还搁这讨赞呢！！！'
    while (true) {
      let res = null
      try {
        res = await new QQApi(e).thumbUp(e.user_id, 10)
      } catch (error) {
        logger.error(error)
        return e.reply(error.message)
      }
      logger.debug(`${e.logFnc}给${e.user_id}点赞`, res)
      if (res.code != 0) {
        if (res.code == 1) {
          failsMsg = '点赞失败，请检查是否开启陌生人点赞或添加好友'
        } else {
          failsMsg = res.msg
        }
        break
      } else {
        n += 10
      }
    }
    let successMsg = `给你点了${n}下哦，记得回我~ ${isFriend ? '' : '(如点赞失败请添加好友)'}`
    const avatar = `https://q1.qlogo.cn/g?b=qq&s=100&nk=${e.user_id}`
    const successFn = _.sample(['ganyu', 'zan'])

    /** 判断点赞是否成功 */
    let msg = n > 0
      ? [
        `\n${successMsg}`,
        segment.image((await memes[successFn](avatar)) ||
          _.sample(successImgs) + e.user_id)
        ]
      : [
        `\n${failsMsg}`,
        segment.image((await memes.crawl(avatar)) ||
          _.sample(faildsImgs) + e.user_id)
        ]

    /** 回复 */
    e.reply(msg, false, { at: true })
  }

  // github
  async GH (e) {
    const api = 'https://opengraph.githubassets.com'

    let reg = /github.com\/[a-zA-Z0-9-]{1,39}\/[a-zA-Z0-9_-]{1,100}(?:\/(?:pull|issue)\/\d+)?/
    const isMatched = e.msg.match(reg)

    const id = 'Yenai'
    if (isMatched) {
      // const res = isMatched[0].split('/')
      let path = isMatched[0].replace('github.com/', '')
      e.reply(segment.image(`${api}/${id}/${path}`))
      // const [user, repo] = [res[1], res[2].split('#')[0]]
      // e.reply(segment.image(`${api}/${id}/${user}/${repo}`))
    }
  }

  // coser
  async coser (e) {
    const { sese, sesepro } = Config.getGroup(e.group_id)
    if (!sese && !sesepro && !e.isMaster) {
      return e.reply(SWITCH_ERROR)
    }

    e.reply(START_EXECUTION)
    await funApi.coser()
      .then(res => common.recallSendForwardMsg(e, res))
      .catch(err => e.reply(err.message))
  }

  // cos/acg搜索
  async acg (e) {
    let { sese, sesepro } = Config.getGroup(e.group_id)
    if (!sese && !sesepro && !e.isMaster) return e.reply(SWITCH_ERROR)
    e.reply(START_EXECUTION)
    let type = e.msg.match(new RegExp(`^#(${Object.keys(pandadiuType).join('|')})?acg(.*)$`))
    await funApi.pandadiu(type[1], type[2])
      .then(res => common.recallSendForwardMsg(e, res))
      .catch(err => e.reply(err.message))
  }

  // 黑丝
  async heisiwu (e) {
    if (!Config.getGroup(e.group_id).sesepro && !e.isMaster) return e.reply(SWITCH_ERROR)

    e.reply(START_EXECUTION)
    // 获取类型
    const { type, page } = heisiType[e.msg.match(/#?来点(.*)/)[1]]
    await funApi.heisiwu(type, page)
      .then(res => common.recallSendForwardMsg(e, _.take(res, 20)))
      .catch(err => e.reply(err.message))
  }

  // 萌堆
  async mengdui (e) {
    if (!Config.getGroup(e.group_id).sesepro && !e.isMaster) return e.reply(SWITCH_ERROR)
    // 开始执行
    e.reply(START_EXECUTION)
    let regRet = e.msg.match(/#?来点神秘图(s)?(.*)/)
    await funApi.mengdui(regRet[2], regRet[1])
      .then(res => common.recallSendForwardMsg(e, res))
      .catch(err => e.reply(err.message))
  }

  async xiuren (e) {
    if (!Config.getGroup(e.group_id).sesepro && !e.isMaster) return e.reply(SWITCH_ERROR)
    // 开始执行
    e.reply(START_EXECUTION)
    await funApi.xiuren(e.msg.replace(/#?来点/, ''))
      .then(res => common.recallSendForwardMsg(e, res))
      .catch(err => e.reply(err.message))
  }

  // 铃声多多
  async lingsheng (e) {
    let msg = e.msg.replace(/#|铃声搜索/g, '')
    let api = `https://xiaobai.klizi.cn/API/music/lingsheng.php?msg=${msg}&n=1`
    let res = await fetch(api).then(res => res.json()).catch(err => logger.error(err))
    if (!res) return e.reply(API_ERROR)
    if (res.title == null && res.author == null) return e.reply('❎ 没有找到相关的歌曲哦~', true)

    await e.reply([
      `标题：${res.title}\n`,
      `作者：${res.author}`
    ])
    await e.reply(await uploadRecord(res.aac, 0, false))
  }

  /** 半次元话题 */
  async bcyTopic (e) {
    let api = 'https://xiaobai.klizi.cn/API/other/bcy_topic.php'
    let res = await fetch(api).then(res => res.json()).catch(err => logger.error(err))
    if (!res) return e.reply(API_ERROR)
    if (res.code != 200) return e.reply('❎ 出错辣' + JSON.stringify(res))
    if (_.isEmpty(res.data)) return e.reply('请求错误！无数据，请稍后再试')
    let msg = []
    for (let i of res.data) {
      if (!i.title || _.isEmpty(i.image)) continue
      msg.push(i.title)
      msg.push(i.image.map(item => segment.image(item)))
    }
    if (_.isEmpty(msg)) return this.bcyTopic(e)
    common.getforwardMsg(e, msg)
  }

  // api大集合
  async picture (e) {
    let { sese, sesepro } = Config.getGroup(e.group_id)
    if (!sese && !sesepro && !e.isMaster) return false
    let key = 'yenai:apiAggregate:CD'
    if (await redis.get(key)) return false

    if (/jktj|接口统计/.test(e.msg)) {
      let msg = ['现接口数量如下']
      for (let i in picapis) {
        if (i == 'mode') continue
        let urls = picapis[i].url || picapis[i]
        msg.push(`\n♡ ${i} => ${Array.isArray(urls) ? urls.length : 1}`)
      }
      return e.reply(msg)
    }
    // 解析消息中的类型
    let regRet = apiReg.exec(e.msg)
    if (regRet[1] == 'mode') return false
    let picObj = picapis[_.sample(Object.keys(picapis).filter(item => new RegExp(item).test(regRet[1])))]
    if (Array.isArray(picObj)) picObj = _.sample(picObj)
    let urlReg = /^https?:\/\/(([a-zA-Z0-9_-])+(\.)?)*(:\d+)?(\/((\.)?(\?)?=?&?[a-zA-Z0-9_-](\?)?)*)*$/i
    if (!picObj.url && !urlReg.test(encodeURI(picObj)) && !Array.isArray(picObj)) {
      return logger.error(`${e.logFnc}未找到url`)
    }

    if (picObj.type !== 'image' && picObj.type !== 'text' && picObj.type !== 'json' && picObj.type) {
      return logger.error(`${e.logFnc}类型不正确`)
    }

    let url = picObj.url || picObj
    // 数组随机取或指定
    if (Array.isArray(url)) url = _.sample(url)

    url = encodeURI(url)

    if (picObj.type == 'text') {
      url = await fetch(url).then(res => res.text()).catch(err => logger.error(err))
    } else if (picObj.type == 'json') {
      if (!picObj.path) return logger.error(`${e.logFnc}json未指定路径`)
      let res = await fetch(url).then(res => res.json()).catch(err => logger.error(err))
      url = _.get(res, picObj.path)
    }
    if (!url) return logger.error(`${e.logFnc}未获取到图片链接`)

    logger.debug(`${e.logFnc}使用接口:${url}`)
    common.recallsendMsg(e, segment.image(url))
    redis.set(key, 'cd', { EX: 2 })
  }
}
