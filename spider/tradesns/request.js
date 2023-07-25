/* 
    url: https://www.tradesns.com/cn/report/index?keywords=1676104773000
    网站输入搜索hscode: 392210


    模拟请求 post https://www.tradesns.com/cn/api/GetSearchCompanyList
    模拟参数
    {"country_id":0,"date":{"start":"202101","end":"202112"},"resources":1,"form_data_type":1,"type":1,"hscode":{"flag":1,"key":"392210","AND":[],"OR":[],"NOT":[]},"companyType":"cord"}

    模拟结果
    状态码返回404,  返回的是html页面数据，

    分析过程
    请求reuqest-header: pplication/x-www-form-urlencoded; charset=UTF-8
    
    response-header: text/html; charset=UTF-8

*/




/* 统一抓去数据 202001 - 202312(截止2023.02.12) */
const qs = require('qs')

const axios = require('axios')
// axios('https://www.tradesns.com/cn/api/GetSearchCompanyList', {
//     method: 'post', body: JSON.stringify({
//         "country_id": 0,
//         "date": {
//             "start": "202101",
//             "end": "202112"
//         },
//         "resources": 1,
//         "form_data_type": 1,
//         "type": 1,
//         "hscode": {
//             "flag": 1,
//             "key": "392210",
//             "AND": [],
//             "OR": [],
//             "NOT": []
//         },
//         "page": 1,
//         "limit": 40,
//         "sort": "",
//         "companyType": "cord",
//         "order": ""
//     })
// }).then(data => {
//     console.log('====================================');
//     console.log('data123', data);
//     console.log('====================================');
// }).catch(err => {
//     console.log('====================================');
//     console.log('err', err);
//     console.log('====================================');
// })




// const data = {
//     "country_id": 0,
//     "date": {
//         "start": "202101",
//         "end": "202112"
//     },
//     "resources": 1,
//     "form_data_type": 1,
//     "type": 1,
//     "hscode": {
//         "flag": 1,
//         "key": "392210",
//         "AND": [],
//         "OR": [],
//         "NOT": []
//     },
//     "page": 1,
//     "limit": 40,
//     "sort": "",
//     "companyType": "cord",
//     "order": ""
// }


// fetch('https://www.tradesns.com/cn/api/GetSearchCompanyList', {
//     method: 'post', 'headers': { 
//         "x-csrf-token": "BDwtllefkhRFdzBSeVBVUmos5FHNyDvW8vusVHwN",
//         'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
//      }, body: 'country_id=0{"country_id":0,"date":{"start":"202101","end":"202112"},"resources":1,"form_data_type":1,"type":"1","hscode":{"flag":1,"key":"392210","AND":[],"OR":[],"NOT":[]},"page":1,"limit":20,"sort":"","companyType":"cord","order":""}'
// }).then(res => { console.log('res123', res.json()) })


//亲测OK
const data = {
    data: {"country_id":0,"date":{"start":"20201","end":"202312"},"resources":1,"form_data_type":1,"type":1,"hscode":{"flag":1,"key":"392210","AND":[],"OR":[],"NOT":[]},"page":1,"limit":200,"sort":"","companyType":"cord","order":""}
  }

console.log(qs.stringify(data))

// fetch('https://www.tradesns.com/cn/api/GetSearchCompanyList', {
//     method: 'post', 'headers': { 
//         "x-csrf-token": "BEKGSF4tjlcFSS06z07lTeosTTVH077uVHs6Dy7F",
//         'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
//      }, body: 'data=%7B%22country_id%22%3A0%2C%22date%22%3A%7B%22start%22%3A%22202101%22%2C%22end%22%3A%22202112%22%7D%2C%22resources%22%3A1%2C%22form_data_type%22%3A1%2C%22type%22%3A1%2C%22hscode%22%3A%7B%22flag%22%3A1%2C%22key%22%3A%22392210%22%2C%22AND%22%3A%5B%5D%2C%22OR%22%3A%5B%5D%2C%22NOT%22%3A%5B%5D%7D%2C%22page%22%3A1%2C%22limit%22%3A4884%2C%22sort%22%3A%22%22%2C%22companyType%22%3A%22cord%22%2C%22order%22%3A%22%22%7D'
// }).then(res => { console.log('res123', res.json()) })

console.log('qs.parse', qs.parse('data=%7B%22country_id%22%3A0%2C%22date%22%3A%7B%22start%22%3A%22202101%22%2C%22end%22%3A%22202112%22%7D%2C%22resources%22%3A1%2C%22form_data_type%22%3A1%2C%22type%22%3A1%2C%22hscode%22%3A%7B%22flag%22%3A1%2C%22key%22%3A%22392210%22%2C%22AND%22%3A%5B%5D%2C%22OR%22%3A%5B%5D%2C%22NOT%22%3A%5B%5D%7D%2C%22page%22%3A1%2C%22limit%22%3A4884%2C%22sort%22%3A%22%22%2C%22companyType%22%3A%22cord%22%2C%22order%22%3A%22%22%7D'))



// axios.get('https://www.google.com.hk/search?q=%3Asite%3A+in.toto.com+&newwindow=1&ei=_UzoY6rQI--G3LUP8aeU-Ac&ved=0ahUKEwjqwqGG9o79AhVvA7cAHfETBX8Q4dUDCA8&uact=5&oq=%3Asite%3A+in.toto.com+glass&gs_lcp=Cgxnd3Mtd2l6LXNlcnAQAzIFCCEQoAEyBQghEKABMgUIIRCgATIFCCEQoAE6CggAEEcQ1gQQsAM6BQgAEKIEOgcIABAeEKIEOgUIIRCrAjoLCCEQFhAeEPEEEB06CAghEBYQHhAdSgQIQRgASgQIRhgAULgRWOdgYMthaA1wAXgAgAGgAYgB1QySAQQyLjEymAEAoAEByAEIwAEB&sclient=gws-wiz-serp').then(res => { 
//     console.log(res.data)
//     //写入文件

// })
