const axios = require('axios')
const cheerio = require('cheerio')
const path = require('path')
const originCompanyList = require('./door-handles/door-handles.json')
const fs = require('fs')
const { promiseAll } = require('./promiseAll')

const headers = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
}
const originData = originCompanyList.data.data
let companyList = originData
const pageNum = 11
const minId = (pageNum - 1) * 100 + 1 
// const minId = (pageNum - 1) * 10 + 1
// // 尝试过3页过大，下次先尝试 + 2
const maxId = pageNum * 100

//取出第几页
console.log('====================================');
console.log(`取出第${pageNum}页`);
console.log('====================================');
companyList = companyList.filter(item => {
    const id = Number(item.id)
    return minId <= id && id <= maxId
})


// console.log('dataString', dataString,)
// console.log(qs.stringify(data))
// console.log('res', res)
// console.log('qs', qs.parse('%7B%22country_id%22%3A0%2C%22date%22%3A%7B%22start%22%3A%22202101%22%2C%22end%22%3A%22202112%22%7D%2C%22resources%22%3A1%2C%22form_data_type%22%3A1%2C%22type%22%3A%221%22%2C%22hscode%22%3A%7B%22flag%22%3A1%2C%22key%22%3A%22392210%22%2C%22AND%22%3A%5B%5D%2C%22OR%22%3A%5B%5D%2C%22NOT%22%3A%5B%5D%7D%7D'))
//self
// console.log('qs.parse', qs.parse('data=%7B%22country_id%22%3A0%2C%22date%22%3A%7B%22start%22%3A%22202101%22%2C%22end%22%3A%22202112%22%7D%2C%22resources%22%3A1%2C%22form_data_type%22%3A1%2C%22type%22%3A1%2C%22hscode%22%3A%7B%22flag%22%3A1%2C%22key%22%3A%22392210%22%2C%22AND%22%3A%5B%5D%2C%22OR%22%3A%5B%5D%2C%22NOT%22%3A%5B%5D%7D%2C%22page%22%3A1%2C%22limit%22%3A200%2C%22sort%22%3A%22%22%2C%22companyType%22%3A%22cord%22%2C%22order%22%3A%22%22%7D'))



// :site: in.toto.com (door OR glass) handles OR ～shower


// 谷歌根据 company  搜索网站
// 1.先判断是否有网站，取出第一个搜索结果，判断地址是否是一个网站
//   1.1 没有网站，移除
//   1.2 取出网站，使用:site 匹配 whitelist

let reqCount = 0

const isURL = (str_url) => {
    var strRegex = "^((https|http|ftp|rtsp|mms)?://)"
        + "?(([0-9a-z_!~*'().&=+$%-]+: )?[0-9a-z_!~*'().&=+$%-]+@)?" //ftp的user@ 
        + "(([0-9]{1,3}\.){3}[0-9]{1,3}" // IP形式的URL- 199.194.52.184 
        + "|" // 允许IP和DOMAIN（域名）
        + "([0-9a-z_!~*'()-]+\.)*" // 域名- www. 
        + "([0-9a-z][0-9a-z-]{0,61})?[0-9a-z]\." // 二级域名 
        + "[a-z]{2,6})" // first level domain- .com or .museum 
        + "(:[0-9]{1,4})?" // 端口- :80 
        + "((/?)|" // a slash isn't required if there is no file name 
        + "(/[0-9a-z_!~*'().;?:@&=+$,%#-]+)+/?)$";
    var re = new RegExp(strRegex);
    //re.test()
    if (re.test(str_url)) {
        return (true);
    } else {
        return (false);
    }
}


const whiteList = ['glass', 'door', 'handles', 'hinges', 'shower', 'bathroom']
const websiteBackList = [
    'www.volza.com',
    'panjiva.com',
    'www.importgenius.com',
    'rt-express.com',
    'www.datamyne.com',
    'www.amazon.com',
    'www.linkedin.com',
    'in.linkedin.com',
    'vn.linkedin.com',
    'pk.linkedin.com',
    'www.mapquest.com',
    'www.waze.com',
    'www.facebook.com',
    'm.facebook.com',
    'www.instagram.com',
    'play.google.com',
    'apps.apple.com',
    'tfli.com',
    'totalfreightw.com',
    'www.indeed.com',
    'www.dnb.com',
    'app.joinhandshake.com',
    'www.constructionjournal.com',
    'www.kkday.com',
    'www.pinterest.com',
    'www.thecompanycheck.com',
    'www.ebay.com',
    'books.google.com.hk',
    'www.cr.gov.hk',
    'vanguardlogistics.jp',
    'www.vanguardlogistics.com',
    'www.universalcargo.com',
    'connect2india.com',
    'lclxchange.com',
    'eximtradedata.com',
    'weformonline.com',
    'edr-info.com',
    'www.crunchbase.com',
    'twitter.com',
    'www.exportgenius.in',
    'www.zoominfo.com',
    'en.wilcan.com',
    'en.52wmb.com',//外贸帮
    'vn.kompass.com',
    'www.hkex.com.hk',
    'www.gld.gov.hk',
    'www.marketscreener.com',
    'magazine360.co.nz',
    'www.similarweb.com',
    'www.businessbook.pk',
    'deik.org.tr',
    'news.samsung.com',
    'en.vietnamexport.com',//出口
    'vietnamcredit.com.vn',
    'seamless.ai',
    'www.justdial.com',
    'vinabiz.us',
    'masothue.com',
    'www.matchlink.asia',
    'www.tratencongty.com',
    'masocongty.vn',
    'dauthau.asia',
    'www.speedierlogistic.com',
    'www.usprimeagency.net',
    'www.allynw.com',
]


// 根据搜索内容，获取网站数组
const getWebSiteUrl = (htmlStr) => {
    const $ = cheerio.load(htmlStr)
    let websiteUrlArrs = []

    $(".BNeawe").each(function (index, element) {
        // console.log('$(element).text()', $(element).text());
        //只取前三项网站，后面大概率没用
        if(index > 3) return
        const content = $(element).text();
        // console.log('获取网站数组-- 过程', content);
        // 把遍历到的网站放到数组，一起返回网站列表
        // 1. www.webscomercio.com 直接push
        // 2.  www.directorioempresarialmexico.com › empresa › M... 切割 > 取第一项
        if (isURL(content)) {
            websiteUrlArrs.push(content)
        }


        if (content.includes('›')) {
            let url = content.split('›')[0]
            url = url.trim()
            websiteUrlArrs.push(url)

        }

    })

    //网站黑名单过滤
    websiteUrlArrs = websiteUrlArrs.filter(item => {
        return !websiteBackList.includes(item)
    })
    // console.log('获取网站数组--结果 websiteUrlArrs', websiteUrlArrs);
    return websiteUrlArrs
}

// 根据公司名，google搜索，得到符合要求的网名
const getWebsiteUrlByCompany = async (company) => {
    if (!company || company === 'N/A') return ''
    const fetchUrl = `https://www.google.com.hk/search?q=${encodeURIComponent(company)}`

    return axios.get(fetchUrl, headers).then(res => {
        const data = res.data
        const htmlStr = data.toString()
        const websiteUrlArr = getWebSiteUrl(htmlStr)
        return websiteUrlArr
    }).catch(err => {
        console.log('err123', err);
        return ''
    })

}




// 校验网站内容函数
const checkWebsiteContent = (htmlStr) => {
    const $ = cheerio.load(htmlStr)

    let result = false
    $(".BNeawe").each(function (index, element) {
        // 只读取第1 2项
        if (index === 2 || index === 5) {
            let websiteDesc = $(element).text();
            whiteList.forEach(item => {
                if (websiteDesc.includes(item)) {
                    result = true
                    return false
                }
            })
        }
    })
    return result
}

//请求单个网站，判断内容是否符合，如果符合，网址push 进数组
const fetchDataContent = (websiteUrl, [], resArr) => {
    reqCount++;
    if (!websiteUrl) return Promise.resolve('')
    const fetchUrl = `https://www.google.com.hk/search?q=site%3A+${websiteUrl}+door+OR+hinges+OR+%7Eshower+OR+hinges&ei=LdPsY43VGJqD3LUP26KogA4&ved=0ahUKEwjNn77Kxpf9AhWaAbcAHVsRCuAQ4dUDCA8&uact=5&oq=site%3A+www.roca.com+door+OR+hinges+OR+%7Eshower+OR+hinges&gs_lcp=Cgxnd3Mtd2l6LXNlcnAQAzIICAAQhgMQsAMyCAgAEIYDELADMggIABCGAxCwAzIICAAQhgMQsAMyCAgAEIYDELADSgQIQRgBUOIFWOIFYIgHaAFwAHgAgAEAiAEAkgEAmAEAoAECoAEByAEFwAEB&sclient=gws-wiz-serp`
    return axios.get(fetchUrl, headers).then(res => {
        // console.log(res.data)
        const data = res.data
        const htmlStr = data.toString()
        const result = checkWebsiteContent(htmlStr)
        if (result) {
            resArr.push({ websiteUrl, googleSearchUrl: fetchUrl })
            console.log('fetchDataContent123', resArr);
        }
    })
}

//根据url数组, 查看网站类容是否符合白名单
const fetchDataByCompany = async (company) => {
    try {
        if (!company) return false
        //获取网站数组
        let websiteUrlArrs = await getWebsiteUrlByCompany(company)
        //没有网站
        if (!websiteUrlArrs.length) return false

        websiteUrlArrs = Array.from(new Set(websiteUrlArrs))

        const PromiseList = []
        const resArr = []
        console.log('websiteUrlArrs', websiteUrlArrs);
        // // 获取到网站数组, 使用google :site 搜索每个地址 'whitelist'
        // websiteUrlArrs.forEach(item=>{
        //     PromiseList.push(fetchDataContent(item, resArr))
        // })
        // 根据网站数组， 生成请求函数， 使用promise.all一并执行
        await promiseAll(websiteUrlArrs, resArr, fetchDataContent, 3)

        // const result = await Promise.all(PromiseList)
        // const fetchUrl = `https://www.google.com.hk/search?q=%3Asite+${websiteUrl}+door&newwindow=1&ei=dDPqY6-YHOb6z7sP6P-g2A8&ved=0ahUKEwivoo_9xZL9AhVm_XMBHeg_CPsQ4dUDCA8&uact=5&oq=%3Asite+in.toto.com+door&gs_lcp=Cgxnd3Mtd2l6LXNlcnAQAzIICAAQhgMQsANKBAhBGAFKBAhGGABQ1QlY8DRgvUVoAXAAeAGAAaoFiAGqBZIBAzUtMZgBAKABAcgBAcABAQ&sclient=gws-wiz-serp`
        // const fetchUrl = `https://www.google.com.hk/search?q=site%3A+${websiteUrl}+door+OR+hinges+OR+%7Eshower+OR+hinges&ei=LdPsY43VGJqD3LUP26KogA4&ved=0ahUKEwjNn77Kxpf9AhWaAbcAHVsRCuAQ4dUDCA8&uact=5&oq=site%3A+www.roca.com+door+OR+hinges+OR+%7Eshower+OR+hinges&gs_lcp=Cgxnd3Mtd2l6LXNlcnAQAzIICAAQhgMQsAMyCAgAEIYDELADMggIABCGAxCwAzIICAAQhgMQsAMyCAgAEIYDELADSgQIQRgBUOIFWOIFYIgHaAFwAHgAgAEAiAEAkgEAmAEAoAECoAEByAEFwAEB&sclient=gws-wiz-serp`
        // console.log('result', result, 'resArr', resArr);
        return resArr
        // return axios.get(fetchUrl).then(res => {
        //     // console.log(res.data)
        //     const data = res.data
        //     const htmlStr = data.toString()
        //     const result = checkWebsiteContent(htmlStr)
        //     if(result){
        //         return websiteUrl
        //     }
        //     return result
        // })
    } catch (error) {
        console.log('fetchDataByCompany123', error);
        return false
    }

}


// console.log('companyList.data.companyList', compaxnyList.data.data)

const getCompanyList = async () => {

    const companyArr = JSON.parse(JSON.stringify(companyList))
    // const PromiseList = []
    // const res = []

    // companyArr.forEach(async (item, index) => {
    //     // fetchDataByCompany('KRONOUS TRADE CORP')
    //     PromiseList.push(fetchDataByCompany(item.company))
    //     // const result = await fetchDataByCompany(item.company)
    //     // if (result) res.push(index)
    // })

    // const list = await Promise.all(PromiseList)
    const list = await promiseAll(companyArr, [], fetchDataByCompany, 3)


    const passCompanyArr = []
    list.forEach((item, index) => {
        if (item) {
            companyArr[index].websiteUrl = item
            passCompanyArr.push(companyArr[index])
        }
    })
    console.log('请求次数', reqCount);
    writeFile(passCompanyArr)
    // 根据结果，遍历数组，得到最终结果
    return passCompanyArr

}


const writeFile = async (result) => {
    const writeData = {
            total: originData.length,
            data:result
    }
    // 写入文件
    fs.writeFile(path.resolve(__dirname, `./door-handles/${pageNum}.json`), JSON.stringify(writeData), (err) => {
        if (err) {
            console.log('err', err);
        }
        console.log('write success');

    })
}

getCompanyList()













