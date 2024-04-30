const fs = require('fs');
const path = require('path');
const { productKeyWords } = require('./config/keyword');

// 定义一个空对象，用于存储满足条件的项
const indexMap = {};

// 遍历读取 importer/usa 目录下的所有 JSON 文件
const directoryPath = './importer/usa/';
fs.readdir(directoryPath, (err, files) => {
    if (err) {
        console.error('Error reading directory:', err);
        return;
    }
    files = files.sort((a, b) => {
        const numberA = parseInt(a.match(/\d+/)[0]); // 提取数字部分并转换为整数
        const numberB = parseInt(b.match(/\d+/)[0]); // 提取数字部分并转换为整数
        return numberA - numberB;
    })
    // console.log('\x1b[36m%s', 'files123', JSON.stringify(files));
    // 循环遍历每个文件
    files.forEach(file => {
        // 读取文件内容
        const filePath = path.join(directoryPath, file);
        const jsonData = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(jsonData);

        // 遍历数据项并检查是否满足规则
        data.forEach((item, index) => {
            item.shipments && item.shipments.forEach(shipment => {
                const productDescriptionArr = shipment.ProductDescription;
                const productDescriptionStr = productDescriptionArr.join(',');
                // console.log('\x1b[36m%s', 'productDescriptionStr123', productDescriptionStr);
                productKeyWords.forEach(productKeyWord => {
                    if (productDescriptionStr.toLowerCase().includes(productKeyWord)) {
                        // 将满足规则的项添加到 indexMap 中
                        if (!indexMap[file]) {
                            indexMap[file] = [];
                        }
                        if (!indexMap[file].includes(item.url)) indexMap[file].push(item.url);
                    }
                });
            });
        });
    });
    const arr = []
    Object.entries(indexMap).map((k, v) => {
        arr.push(v)
    })
    // 打印结果
    // console.log('indexMap:', indexMap, 'arr', arr.length,);
    console.log('arr', arr.length,);
});
