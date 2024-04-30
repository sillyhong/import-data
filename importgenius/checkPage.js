const fs = require('fs');
const path = require('path');

// 定义文件夹路径
const directoryPath = path.join(__dirname, 'importer/usa');

// 初始化一个数组，用于存储缺失的文件序号
const missingIndexes = [];

// 遍历 1-600.json 文件
for (let i = 1; i <= 600; i++) {
    // 构建文件名
    const fileName = `${i}.json`;
    // 构建文件路径
    const filePath = path.join(directoryPath, fileName);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        // 如果文件不存在，则将其序号添加到缺失的数组中
        missingIndexes.push(i);
    }
}

// 输出缺失的文件序号
console.log('缺失的文件序号:', missingIndexes);
