const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

//优先读取scrapeArr
const scrapeArr = []


// 定义要爬取的页面范围
const startPage = 1001;
const endPage = 1200;



const country = 'us'// 美国

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 定义爬取函数
async function scrapePage(pageNumber) {
    try {
        const url = `https://www.importgenius.cn/tradebase/browse/importer/latest/${pageNumber}`;
        console.log('\x1b[36m%s', 'url123', url);
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
                    importerData = nuxtData.state.tradebase.traders[country].importers[pageNumber]
                    return false; // 结束循环
                }
            }
        });


        // 处理需要的数据
        importerData = importerData.map(item => {
            delete item.consignees;//收货人
            delete item.datapoints; // 图标信息
            delete item.ports;//港口细腻下
            return item
        })
        // 写入数据到文件
        const writhPath = path.join(__dirname, `importer/usa/${pageNumber}.json`)
        console.log('\x1b[36m%s', 'writhPath123', `importer/usa/${pageNumber}.json`);
        fs.writeFileSync(writhPath, JSON.stringify(importerData));

        console.log(`Page ${pageNumber} scraped successfully.`);
    } catch (error) {
        console.error(`Error scraping page ${pageNumber}: ${error}`);
    }
}


// 主函数，循环爬取指定页面范围的数据
async function main(scrapeArr = []) {
    if (!scrapeArr.length) {
        for (let i = startPage; i <= endPage; i++) {
            scrapeArr.push(i);
        }
    }
    for (let i = 0; i < scrapeArr.length; i++) {
        const pageNumber = scrapeArr[i];
        await scrapePage(pageNumber);
        await delay(650); // 等待 800 毫秒
    }
}

main(scrapeArr);
