/* 
    优先机： 
    1. 如果优先传入scrapeArr 只会读取scrapeArr里面的页码，不如传入[1,3, 5], 只拉取这三页
    2. 默认读取200页
*/

const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)

//优先读取scrapeArr
const scrapeArr = []

/* 北美 */
// const country = 'usa'// 美国 done

/* 亚洲 */
// const country = 'india'// 印度
// const country = 'vietnam'//越南
// const country = 'turkey'//土耳其 error


/* 欧洲 */
// const country = 'russia'//俄罗斯
// const country = 'ukraine'//乌克兰


/* 拉丁美洲 */
// const country = 'argentina'// 阿根廷 done
// const country = 'chile'// 智利 done
// const country = 'colombia'// 哥伦比亚 done
// const country = 'costarica'// 哥斯达黎加  done
// const country = 'ecuador'// 厄瓜多尔 done
const country = 'panama'// 巴拿马  done
// const country = 'peru'// 秘鲁  done
// const country = 'paraguay'// 巴拉圭 done 
// const country = 'uruguay'// 乌拉圭 
// const country = 'venezuela'// 委内瑞拉 





// 返回 startPage 和 endPage
const getIndexByFile = (country) => {
    // 读取 importer/country 目录下的所有 JSON 文件
    const directoryPath = path.join(__dirname, `importer/${country}`);
    // 检查目录是否存在，如果不存在则创建它
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
        console.log(`Directory ${directoryPath} created.`);
    }
    let jsonFiles = fs.readdirSync(directoryPath);

    jsonFiles = jsonFiles.sort((a, b) => {
        const numberA = parseInt(a.match(/\d+/)[0]); // 提取数字部分并转换为整数
        const numberB = parseInt(b.match(/\d+/)[0]); // 提取数字部分并转换为整数
        return numberA - numberB;
    })

    // 获取当前文件最后一个json名字
    const lastJsonFile = jsonFiles.length ? jsonFiles[jsonFiles.length - 1] : 0

    // 定义要爬取的页面范围
    const startPage = parseInt(lastJsonFile) + 1

    const endPage = startPage + 200
    return {
        startPage,
        endPage
    }

}


const getUrlPrefix = (country) => {
    return country === 'usa' ? '' : `${country}/`
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const getUrl = (country, pageNumber) => {
    if (country === 'usa') {
        // https://www.importgenius.cn/tradebase/browse/importer/latest/1
        return `https://www.importgenius.cn/tradebase/browse/importer/latest/${pageNumber}`;
    } else {
        // https://www.importgenius.cn/argentina/tradebase/importer/latest/1
        return `https://www.importgenius.cn/${getUrlPrefix(country)}tradebase/importer/latest/${pageNumber}`;

    }

}

const countryMap = {
    'usa': 'us',
    'argentina': 'argentina',
    'chile': 'chile',
}

// 定义爬取函数
async function scrapePage(country, pageNumber) {
    try {
        const url = getUrl(country, pageNumber)
        // console.log('\x1b[36m%s', 'url123', url);
        const response = await axios.get(url);
        const html = response.data;
        // console.log('\x1b[36m%s', 'html123', html);
        const $ = cheerio.load(html);

        // 获取页面中所有的script标签
        const scriptTags = $('script');

        let importerData;

        // 遍历所有的script标签，查找包含 window.__NUXT__ 的代码
        scriptTags.each((index, element) => {
            const scriptContent = $(element).html();
            if (scriptContent.includes('window.__NUXT__')) {
                // 找到包含 window.__NUXT__ 的代码，提取其内容
                // const nuxtDataRegex = /window\.__NUXT__\s*=\s*(.*?);/s;
                const nuxtDataRegex = /window\.__NUXT__=([\s\S]*?)\)\);/;

                const matches = scriptContent.match(nuxtDataRegex);
                if (matches && matches.length > 1) {
                    // 执行 JavaScript 代码
                    // const nuxtData = vm.runInNewContext('(' + matches[1] + ')');
                    const nuxtData = vm.runInNewContext(matches[1] + '))');


                    // 输出 window.__NUXT__ 的值
                    // console.log('window.__NUXT__ 的值为:', nuxtData.state.tradebase.traders[country].importers[pageNumber]);
                    // window.__NUXT__.state.tradebase.traders.us.importers[134]
                    const countryMapRes = countryMap[country] || country
                    importerData = nuxtData.state.tradebase.traders[countryMapRes].importers[pageNumber]
                    return false; // 结束循环
                }
            }
        });


        // 处理需要的数据
        importerData = importerData.map(item => {
            delete item.consignees;//收货人
            delete item.datapoints; // 图标信息
            delete item.ports;//港口细腻下
            
            // 转换 mostRecentDate 为北京时间格式（Unix 时间戳是秒，需要用 dayjs.unix()）
            if (item.mostRecentDate && typeof item.mostRecentDate === 'number') {
                item.mostRecentDate = dayjs.unix(item.mostRecentDate).format('YYYY-MM-DD HH:mm:ss');
            }
            // 处理 shippers 中的 mostRecentDate
            if (item.shippers && item.shippers.items) {
                item.shippers.items = item.shippers.items.map(shipper => {
                    if (shipper.mostRecentDate && typeof shipper.mostRecentDate === 'number') {
                        shipper.mostRecentDate = dayjs.unix(shipper.mostRecentDate).format('YYYY-MM-DD HH:mm:ss');
                    }
                    return shipper;
                });
            }
            return item
        })
        // 写入数据到文件
        const writhPath = path.join(__dirname, `importer/${country}/${pageNumber}.json`)
        console.log('\x1b[36m%s', 'writhPath123', `importer/${country}/${pageNumber}.json`);
        fs.writeFileSync(writhPath, JSON.stringify(importerData));

        console.log(`Page ${pageNumber} scraped successfully.`);
    } catch (error) {
        console.error(`Error scraping page ${pageNumber}: ${error}`);
    }
}


// 主函数，循环爬取指定页面范围的数据
async function fetchImporter(country, scrapeArr = []) {
    // 转换为数组
    scrapeArr = Array.isArray(scrapeArr) ? scrapeArr : [scrapeArr]
    const { startPage, endPage } = getIndexByFile(country)
    if (!scrapeArr.length) {
        for (let i = startPage; i <= endPage; i++) {
            scrapeArr.push(i);
        }
    }
    for (let i = 0; i < scrapeArr.length; i++) {
        const pageNumber = scrapeArr[i];
        await scrapePage(country, pageNumber);
        await delay(4000); // 等待 800 毫秒
    }
}

// fetchImporter('panama', 2);

module.exports = {
    fetchImporter
}
