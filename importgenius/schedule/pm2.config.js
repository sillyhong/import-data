
module.exports = {
    apps: [
        {
            name: 'importgenius-schedule',
            script: 'importgenius/schedule/getData.js', // 指定要运行的脚本文件
            env: {
                NODE_ENV: 'production',
                // 你可以在这里添加更多的环境变量
            },
            // 其他 PM2 配置选项
            instances: 1, // 设置为 1 表示只运行一个实例
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
        },
    ],
};
