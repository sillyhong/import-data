const qs = require('qs')
var $ = require("jquery")
const data = {
    data: {
        country_id: 0,
        "date": { "start": "202101", "end": "202112" },
        "resources": 1, "form_data_type": 1, "type": 1, "hscode": { "flag": 1, "key": "392210", "AND": [], "OR": [], "NOT": [] }, "page": 1, "limit": 1000, "sort": "", "companyType": "cord", "order": ""
    }
}
const res = qs.stringify(data)

var dataString = "";
for (var key in data) {
    dataString += key + "=" + data[key] + "&";
};


console.log('dataString', dataString,)
console.log(qs.stringify(data))
// console.log('res', res)
// console.log('qs', qs.parse('%7B%22country_id%22%3A0%2C%22date%22%3A%7B%22start%22%3A%22202101%22%2C%22end%22%3A%22202112%22%7D%2C%22resources%22%3A1%2C%22form_data_type%22%3A1%2C%22type%22%3A%221%22%2C%22hscode%22%3A%7B%22flag%22%3A1%2C%22key%22%3A%22392210%22%2C%22AND%22%3A%5B%5D%2C%22OR%22%3A%5B%5D%2C%22NOT%22%3A%5B%5D%7D%7D'))
//self
// console.log('qs.parse', qs.parse('data=%7B%22country_id%22%3A0%2C%22date%22%3A%7B%22start%22%3A%22202101%22%2C%22end%22%3A%22202112%22%7D%2C%22resources%22%3A1%2C%22form_data_type%22%3A1%2C%22type%22%3A1%2C%22hscode%22%3A%7B%22flag%22%3A1%2C%22key%22%3A%22392210%22%2C%22AND%22%3A%5B%5D%2C%22OR%22%3A%5B%5D%2C%22NOT%22%3A%5B%5D%7D%2C%22page%22%3A1%2C%22limit%22%3A20%2C%22sort%22%3A%22%22%2C%22companyType%22%3A%22cord%22%2C%22order%22%3A%22%22%7D'))
console.log('qs.parse', qs.parse('data=%7B%22country_id%22%3A0%2C%22date%22%3A%7B%22start%22%3A%22202101%22%2C%22end%22%3A%22202112%22%7D%2C%22resources%22%3A1%2C%22form_data_type%22%3A1%2C%22type%22%3A1%2C%22hscode%22%3A%7B%22flag%22%3A1%2C%22key%22%3A%22392210%22%2C%22AND%22%3A%5B%5D%2C%22OR%22%3A%5B%5D%2C%22NOT%22%3A%5B%5D%7D%2C%22page%22%3A1%2C%22limit%22%3A200%2C%22sort%22%3A%22%22%2C%22companyType%22%3A%22cord%22%2C%22order%22%3A%22%22%7D'))
// console.log('params', $.param(data))


// :site: in.toto.com (door OR glass) handles OR ～shower

