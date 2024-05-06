const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const axios = require('axios');
const vm = require('vm');

// 定义每次处理的数据数量
const batchSize = 4;

// 读取 importer/usa 目录下的所有 JSON 文件
const directoryPath = path.join(__dirname, 'importer/usa');
let jsonFiles = fs.readdirSync(directoryPath);
jsonFiles = jsonFiles.sort((a, b) => {
    const numberA = parseInt(a.match(/\d+/)[0]); // 提取数字部分并转换为整数
    const numberB = parseInt(b.match(/\d+/)[0]); // 提取数字部分并转换为整数
    return numberA - numberB;
})

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
                                // 只打印 nuxtData.state.profile.shipments[0].shipments 下 第一个数据的ProductDescription， 也是一个数据
                                const tmpData = nuxtData.state.profile.shipments[0].shipments
                                console.log('第一个数据的ProductDescription 的值为:', tmpData && tmpData[0] && tmpData[0].ProductDescription);

                                // 需要返回的shipments
                                shipments = nuxtData.state.profile.shipments[0].shipments;
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

// 定义一个函数，用于处理所有 JSON 文件
async function processAllJsonFiles(files, index) {
    // if (index !== 379) {
    //     console.log('所有数据已处理完成');
    //     return;
    // }
    if (index >= files.length) {
        console.log('所有数据已处理完成');
        return;
    }

    const fileName = files[index];
    const readPath = path.join(directoryPath, fileName);
    console.log('\x1b[36m%s', '处理文件:', readPath);
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

        // 等待 3 秒
        await new Promise(resolve => setTimeout(resolve, 2700));
    }

    // 处理下一个 JSON 文件
    await processAllJsonFiles(files, index + 1);
}

// 开始处理所有 JSON 文件，从索引 0 开始
processAllJsonFiles(jsonFiles, 1001);
