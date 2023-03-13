import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import { segment } from 'oicq'
import _ from 'lodash'
import { Config } from '../components/index.js'
import { common, uploadRecord, QQApi, funApi } from '../model/index.js'
const heisiType = {
  白丝: { type: 'baisi', page: 17 },
  黑丝: { type: 'heisi', page: 43 },
  巨乳: { type: 'juru', page: 8 },
  jk: { type: 'jk', page: 6 },
  网红: { type: 'mcn', page: 36 },
  美足: { type: 'meizu', page: 9 }
}
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
          fnc: 'zan'
        },
        {
          reg: 'github.com/[a-zA-Z0-9-]{1,39}/[a-zA-Z0-9_-]{1,100}',
          fnc: 'GH'
        },
        // {
        //   reg: '^#?coser$',
        //   fnc: 'coser'
        // },
        {
          reg: `#?来点(${Object.keys(heisiType).join('|')})$`,
          fnc: 'heisiwu'
        },
        {
          reg: '^#?铃声搜索.*$',
          fnc: 'lingsheng'
        },
        {
          reg: '^#?半次元话题$',
          fnc: 'bcy_topic'
        },
        {
          reg: apiReg,
          fnc: 'picture'
        },
        {
          reg: '^#?来点神秘图(\\d+|s.*)?$',
          fnc: 'mengdui'
        },
        {
          reg: '^#acg.*$',
          fnc: 'acg'
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
    let msg = e.msg.match(/#(([\u4e00-\u9fa5]{2,6})-)?([\u4e00-\u9fa5]{2,6})?翻译(.*)/)
    if (!msg) return
    if (e.source) {
      let source
      if (e.isGroup) {
        source = (await e.group.getChatHistory(e.source.seq, 1)).pop()
      } else {
        source = (await e.friend.getChatHistory(e.source.time, 1)).pop()
      }
      msg[4] = source.message.filter(item => item.type == 'text').map(item => item.text).join('')
    }

    let results = await funApi.youdao(msg[4], msg[3], msg[2])
    return e.reply(results, true)
  }

  /** 点赞 */
  async zan (e) {
    if (Bot.config.platform == 3) return e.reply('❎ 手表协议暂不支持点赞请更换协议后重试')
    /** 判断是否为好友 */
    let isFriend = await Bot.fl.get(e.user_id)
    let likeByStrangers = Config.Notice.Strangers_love
    if (!isFriend && !likeByStrangers) return e.reply('不加好友不点🙄', true)
    /** 点赞成功回复的图片 */
    let imgs = [
      'https://xiaobai.klizi.cn/API/ce/zan.php?qq=',
      // "https://xiaobai.klizi.cn/API/ce/xin.php?qq=",
      'http://ovooa.com/API/zan/api.php?QQ=',
      'http://api.caonm.net/api/bix/b.php?qq=',
      'http://api.caonm.net/api/kan/kan_3.php?qq='
    ]
    /** 一个随机数 */
    let random = Math.floor(Math.random() * (imgs.length - 0))
    let successImg = segment.image(imgs[random] + e.user_id)

    /** 点赞失败的图片 */
    let faildsImg = segment.image(`https://xiaobai.klizi.cn/API/ce/paa.php?qq=${e.user_id}`)

    /** 执行点赞 */
    let n = 0
    let failsmsg = '今天已经点过了，还搁这讨赞呢！！！'
    while (true) {
      // 好友点赞
      if (!likeByStrangers || isFriend) {
        let res = await Bot.sendLike(e.user_id, 10)
        logger.debug(`${e.logFnc}好友点赞`, res)
        if (res) {
          n += 10
        } else break
      } else {
        // 陌生人点赞
        let res = await QQApi.thumbUp(e.user_id, 10)
        logger.debug(`${e.logFnc}陌生人点赞`, res)
        if (res.code != 0) {
          if (res.code == 1) {
            failsmsg = '点赞失败，请检查是否开启陌生人点赞或添加好友'
          } else {
            failsmsg = res.msg
          }
          break
        } else {
          n += 10
        }
      }
    }

    /** 回复的消息 */
    let successResult = ['\n', `给你点了${n}下哦，记得回我~${isFriend ? '' : '(如点赞失败请添加好友)'}`, successImg]
    let faildsResult = ['\n', failsmsg, faildsImg]

    /** 判断点赞是否成功 */
    let msg = n > 0 ? successResult : faildsResult
    /** 回复 */
    await e.reply(msg, false, { at: true })

    return true
  }

  // github
  async GH (e) {
    const api = 'https://opengraph.githubassets.com'

    let reg = /github.com\/[a-zA-Z0-9-]{1,39}\/[a-zA-Z0-9_-]{1,100}/
    const isMatched = e.msg.match(reg)

    const id = 'Yenai'
    if (isMatched) {
      const res = isMatched[0].split('/')
      const [user, repo] = [res[1], res[2].split('#')[0]]
      e.reply(segment.image(`${api}/${id}/${user}/${repo}`))
    }

    return true
  }

  // coser
  // async coser (e) {
  //   let { sese, sesepro } = Config.getGroup(e.group_id)
  //   if (!sese && !sesepro && !e.isMaster) return e.reply(SWITCH_ERROR)

  //   e.reply(START_EXECUTION)

  //   const api = 'http://ovooa.com/API/cosplay/api.php'

  //   let res = await fetch(api).then((res) => res.json()).catch((err) => console.error(err))

  //   if (!res) return e.reply(API_ERROR)

  //   res = res.data
  //   let item = 1
  //   let msg = [res.Title]
  //   for (let i of res.data) {
  //     msg.push(segment.image(i))
  //     if (item >= 20) {
  //       break
  //     } else {
  //       item++
  //     }
  //   }
  //   common.getRecallsendMsg(e, msg)
  //   return true
  // }

  // cos/acg搜索
  async acg (e) {
    let { sese, sesepro } = Config.getGroup(e.group_id)
    if (!sese && !sesepro && !e.isMaster) return e.reply(SWITCH_ERROR)
    e.reply(START_EXECUTION)

    let keywords = e.msg.replace(/#|acg/g, '').trim()
    await funApi.pandadiu(keywords)
      .then(res => common.getRecallsendMsg(e, res))
      .catch(err => e.reply(err.message))
  }

  // 黑丝
  async heisiwu (e) {
    if (!Config.getGroup(e.group_id).sesepro && !e.isMaster) return e.reply(SWITCH_ERROR)

    e.reply(START_EXECUTION)
    // 获取类型
    const { type, page } = heisiType[e.msg.match(/#?来点(.*)/)[1]]
    await funApi.heisiwu(type, page)
      .then(res => common.getRecallsendMsg(e, _.take(res, 20)))
      .catch(err => e.reply(err.message))
  }

  // 萌堆
  async mengdui (e) {
    if (!Config.getGroup(e.group_id).sesepro && !e.isMaster) return e.reply(SWITCH_ERROR)
    // 开始执行
    e.reply(START_EXECUTION)
    let regRet = e.msg.match(/#?来点神秘图(s)?(.*)/)
    await funApi.mengdui(regRet[2], regRet[1])
      .then(res => common.getRecallsendMsg(e, res))
      .catch(err => e.reply(err.message))
  }

  // 铃声多多
  async lingsheng (e) {
    let msg = e.msg.replace(/#|铃声搜索/g, '')
    let api = `https://xiaobai.klizi.cn/API/music/lingsheng.php?msg=${msg}&n=1`
    let res = await fetch(api).then(res => res.json()).catch(err => console.log(err))
    if (!res) return e.reply(API_ERROR)
    if (res.title == null && res.author == null) return e.reply('❎ 没有找到相关的歌曲哦~', true)

    await e.reply([
      `标题：${res.title}\n`,
      `作者：${res.author}`
    ])
    await e.reply(await uploadRecord(res.aac, 0, false))
  }

  /** 半次元话题 */
  async bcy_topic (e) {
    let api = 'https://xiaobai.klizi.cn/API/other/bcy_topic.php'
    let res = await fetch(api).then(res => res.json()).catch(err => console.log(err))
    if (!res) return e.reply(API_ERROR)
    if (res.code != 200) return e.reply('❎ 出错辣' + JSON.stringify(res))
    if (_.isEmpty(res.data)) return e.reply('请求错误！无数据，请稍后再试')
    let msg = []
    for (let i of res.data) {
      if (!i.title || _.isEmpty(i.image)) continue
      msg.push(i.title)
      msg.push(i.image.map(item => segment.image(item)))
    }
    if (_.isEmpty(msg)) return this.bcy_topic(e)
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
      url = await fetch(url).then(res => res.text()).catch(err => console.log(err))
    } else if (picObj.type == 'json') {
      if (!picObj.path) return logger.error(`${e.logFnc}json未指定路径`)
      let res = await fetch(url).then(res => res.json()).catch(err => console.log(err))
      url = _.get(res, picObj.path)
    }
    if (!url) return logger.error(`${e.logFnc}未获取到图片链接`)

    logger.debug(`${e.logFnc}使用接口:${url}`)
    common.recallsendMsg(e, segment.image(url))
    redis.set(key, 'cd', { EX: 2 })
  }
}
