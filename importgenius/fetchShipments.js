const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const cheerio = require('cheerio');
const axios = require('axios');
const vm = require('vm');
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)


// 获取命令行参数 需要读取的长度
let needFetchArg = process.argv.slice(2);

if (needFetchArg && needFetchArg.length) {
    needFetchArg = needFetchArg.map(item => Number(item))
}

// 定义每次处理的数据数量
const batchSize = 4;


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
// const country = 'ecuador'// 厄瓜多尔  done
const country = 'panama'// 巴拿马 
// const country = 'peru'// 秘鲁 
// const country = 'paraguay'// 巴拉圭 
// const country = 'uruguay'// 乌拉圭 
// const country = 'venezuela'// 委内瑞拉 

// 处理乌拉圭 'uruguay' 
const handleUruguay = (nuxtData, shipments) => {
    const shipmentDetail = nuxtData.state.profile.shipmentDetails
    shipments = shipments.map(item => {
        item.BillOfLading = item.ArrivalDate
        item.ProductDescription = [shipmentDetail.HSCode, shipmentDetail.HSCodeDescription]
    })

}

const getJSONFilesByCountry = (country) => {
    // 读取 importer/country 目录下的所有 JSON 文件
    const directoryPath = path.join(__dirname, `importer/${country}`);
    let jsonFiles = fs.readdirSync(directoryPath);
    jsonFiles = jsonFiles.sort((a, b) => {
        const numberA = parseInt(a.match(/\d+/)[0]); // 提取数字部分并转换为整数
        const numberB = parseInt(b.match(/\d+/)[0]); // 提取数字部分并转换为整数
        return numberA - numberB;
    })
    return jsonFiles
}

// 获取当前文件最后一个json名字
// const lastJsonFile = jsonFiles.length ? jsonFiles[jsonFiles.length - 1] : 0

// 定义一个函数，用于处理每批次的数据
function processDataBatch(data, startIndex, readPath) {
    return new Promise((resolve, reject) => {
        const endIndex = Math.min(startIndex + batchSize, data.length);

        // 创建一个 Promise 数组，用于存储每条数据的处理结果
        const promises = [];

        for (let i = startIndex; i < endIndex; i++) {
            const item = data[i];
            // 获取 url 值
            const url = `https://www.importgenius.cn/${item.url}`;
            // 使用 axios 获取网页内容
            const promise = axios.get(url)
                .then(response => {
                    const html = response.data;
                    const $ = cheerio.load(html);

                    // 获取页面中所有的 script 标签
                    const scriptTags = $('script');

                    // 定义用于存储所有 shipmentsData 的数组
                    let shipments;

                    // 遍历所有的 script 标签，查找包含 window.__NUXT__.state.profile.shipments 的代码块
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


                                // 需要返回的shipments
                                shipments = nuxtData.state.profile.shipments[0].shipments;

                                // 处理乌拉圭 'uruguay' 
                                if (country === 'uruguay') {
                                    handleUruguay(nuxtData, shipments)
                                }
                                
                                // 转换 shipments 中的 mostRecentDate 为北京时间格式（Unix 时间戳是秒，需要用 dayjs.unix()）
                                if (shipments && Array.isArray(shipments)) {
                                    shipments = shipments.map(shipment => {
                                        if (shipment.mostRecentDate && typeof shipment.mostRecentDate === 'number') {
                                            shipment.mostRecentDate = dayjs.unix(shipment.mostRecentDate).format('YYYY-MM-DD HH:mm:ss');
                                        }
                                        return shipment;
                                    });
                                }
                                // 只打印处理后的 shipments下 第一个数据的ProductDescription， 也是一个数据
                                console.log('第一个数据的ProductDescription 的值为:', shipments && shipments[0] && shipments[0].ProductDescription);

                                return false; // 结束循环
                            }
                        }
                    });

                    // 返回该条数据的 shipmentsData
                    return shipments;
                })
                .catch(error => {
                    console.error('Error fetching page:', error);
                    return null;
                });

            promises.push(promise);
        }

        // 在所有请求完成后，将更新后的数据写入到 readpath 文件中
        Promise.all(promises)
            .then(shipmentsDataArray => {
                // 将每条数据的处理结果写入到原始数据中
                for (let i = 0; i < shipmentsDataArray.length; i++) {
                    data[startIndex + i].shipments = shipmentsDataArray[i];
                }

                // 将更新后的数据重新写入到 readPath 文件中
                const updatedJsonData = JSON.stringify(data, null, 2);
                fs.writeFileSync(readPath, updatedJsonData, 'utf8');

                console.log(`批次 ${Math.floor(startIndex / batchSize) + 1} 数据已更新并写入到${readPath}文件中`);

                resolve(); // 批次处理完成
            })
            .catch(error => {
                reject(error); // 处理失败
            });
    });
}

/**
 * 处理指定国家的 shipments 数据
 * 
 * @param {string} country - 国家代码
 * @param {number} pageOrIndex - 页码或索引
 *   - 当 isIncrementalExecute=false 时，作为页码使用，直接读取 {pageOrIndex}.json
 *   - 当 isIncrementalExecute=true 时，作为起始索引使用，从目录列表中按顺序处理
 * @param {boolean} isIncrementalExecute - 是否增量执行模式
 *   - false: 单次执行模式，直接处理 {pageOrIndex}.json（getData.js 使用）
 *   - true: 增量执行模式，从目录读取文件列表按顺序处理（独立执行时使用）
 */
async function fetchShipments(country, pageOrIndex, isIncrementalExecute = true) {
    let fileName;
    let readPath;

    if (!isIncrementalExecute) {
        // 单次执行模式：直接使用页码作为文件名
        fileName = `${pageOrIndex}.json`;
        readPath = path.join(__dirname, `importer/${country}`, fileName);
        
        // 检查文件是否存在
        if (!fs.existsSync(readPath)) {
            console.log(`⚠️ 文件不存在: ${readPath}`);
            return;
        }
        console.log(`📄 单次模式 - 处理文件: ${fileName}`);
    } else {
        // 增量执行模式：从目录读取文件列表
        const files = getJSONFilesByCountry(country);
        
        if (pageOrIndex > files.length) {
            console.log('所有数据已处理完成');
            return;
        }
        
        const curIndex = pageOrIndex - 1;
        fileName = files[curIndex];
        
        if (!fileName) {
            console.log(`⚠️ 文件不存在: index=${pageOrIndex}, curIndex=${curIndex}, files.length=${files.length}`);
            console.log(`📁 目录 importer/${country} 下没有找到对应的 JSON 文件`);
            return;
        }
        
        readPath = path.join(__dirname, `importer/${country}`, fileName);
        console.log(`📄 增量模式 - 处理文件: ${fileName} (${pageOrIndex}/${files.length})`);
    }


    const jsonData = fs.readFileSync(readPath, 'utf8');
    const data = JSON.parse(jsonData);
    
    // 开始处理数据，从索引 0 开始
    for (let i = 0; i < data.length; i += batchSize) {
        await processDataBatch(data, i, readPath)
            .then(() => {
                console.log(`批次 ${Math.floor(i / batchSize) + 1} 已处理`);
            })
            .catch(error => {
                console.error(`处理批次 ${Math.floor(i / batchSize) + 1} 失败:`, error);
            });

        // 等待 5 秒
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // 增量执行模式：自动处理下一个文件
    if (isIncrementalExecute) {
        const files = getJSONFilesByCountry(country);
        await fetchShipments(country, pageOrIndex + 1, true);
    }
}



// fetchShipments('usa', 1, false);


module.exports = {
    fetchShipments
}
