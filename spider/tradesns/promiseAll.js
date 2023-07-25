
// 并发量
const limit = 10;
// 异步任务的参数数组，一般为url
const array = [
  {
    "id": 1,
    "company": "ROCA BATHROOM PRODUCTS PRIVATE LIMITED",
    "company_cn": "",
    "doc_count": 329,
    "trade_count": 21,
    "weight": 0,
    "qty": 89142.71,
    "price": 996930.22,
    "country": [
      {
        "country_id": 8,
        "count": 329
      }
    ],
    "info": "PLASTIC BATH SHOWER - 1-2 CHROME WATER INLET FOR SHOWER HOSE- ROCA",
    "last_date": 20211229,
    "hscode": [
      {
        "name": "39221000",
        "count": 329
      }
    ]
  },
  {
    "id": 2,
    "company": "COMERCIALIZADORA INTERCERAMIC SA DE CV",
    "company_cn": "",
    "doc_count": 310,
    "trade_count": 3,
    "weight": 5903154.06,
    "qty": 615111.1,
    "price": 3261601.41,
    "country": [
      {
        "country_id": 6,
        "count": 310
      }
    ],
    "info": "LAVABO MONTECARLO PARA GABINETE BLANCO",
    "last_date": 20211231,
    "hscode": [
      {
        "name": "39221001",
        "count": 310
      }
    ]
  },
  {
    "id": 3,
    "company": "MOEN DE MEXICO SA DE CV",
    "company_cn": "",
    "doc_count": 297,
    "trade_count": 3,
    "weight": 2673730.78,
    "qty": 75146.82,
    "price": 1916953.35,
    "country": [
      {
        "country_id": 6,
        "count": 297
      }
    ],
    "info": "REGADERA PLASTICA CON ACCESORIOS",
    "last_date": 20211208,
    "hscode": [
      {
        "name": "39221001",
        "count": 297
      }
    ]
  },
  {
    "id": 4,
    "company": "CôNG TY TNHH THươNG MạI XUấT NHậP KHẩU HòA LộC PHáT",
    "company_cn": "",
    "doc_count": 277,
    "trade_count": 1,
    "weight": 0,
    "qty": 1249,
    "price": 185802,
    "country": [
      {
        "country_id": 286,
        "count": 277
      }
    ],
    "info": "Synthetic plastic bathtub (no: use electricity, function of creating Moscow waves, motor discharge parts with motor, wall frame and steam function), size (1,3x1,3x0,65) M, TDO brand , 100% new.",
    "last_date": 20211220,
    "hscode": [
      {
        "name": "39221011",
        "count": 265
      },
      {
        "name": "39221090",
        "count": 12
      }
    ]
  },
  {
    "id": 5,
    "company": "HANSGROHE S DE RL DE CV",
    "company_cn": "",
    "doc_count": 273,
    "trade_count": 1,
    "weight": 344694.02,
    "qty": 5205.77,
    "price": 398360.02,
    "country": [
      {
        "country_id": 6,
        "count": 273
      }
    ],
    "info": "DUCHA",
    "last_date": 20211208,
    "hscode": [
      {
        "name": "39221001",
        "count": 273
      }
    ]
  },
  {
    "id": 6,
    "company": "ТОВ \"ГЕБЕРІТ ТРЕЙДІНГ\"",
    "company_cn": "",
    "doc_count": 263,
    "trade_count": 1,
    "weight": 160078.59,
    "qty": 160078.59,
    "price": 643942.14,
    "country": [
      {
        "country_id": 9,
        "count": 263
      }
    ],
    "info": "1.Вироби санітарно-технічногопризначення, для застосування у побуті,виготовлені з пластику, (акрилу)постачаються комплектом вупаковці для роздрібної торгівлі:Geberit Soana Duo Прямокутна акриловаванна 180х80 см, Slim rim, в комплекті зніжками, біла арт. 554.004.01.1 -3шт.Geberit Soana Duo Прямокутна акриловаванна 180х80 см, Slim rim, в комплекті зніжками, біла арт. 554.004.01.1 -6шт.Geberit Soana Duo Прямокутна акрилова ванна 180х80 см, Slim rim, в комплекті зніжками, біла арт. 554.004.01.1 -1шт.Торговельна марка : GeberitКраїна виробництва : PLВиробник : Geberit Keramik GmbH",
    "last_date": 20211228,
    "hscode": [
      {
        "name": "3922100000",
        "count": 263
      }
    ]
  },
  {
    "id": 7,
    "company": "VALVULAS URREA SA DE CV",
    "company_cn": "",
    "doc_count": 240,
    "trade_count": 11,
    "weight": 4615822.62,
    "qty": 147066.27,
    "price": 1358389.53,
    "country": [
      {
        "country_id": 6,
        "count": 240
      }
    ],
    "info": "BABERAS DUCHAS FREGADEROS Y LAVABOS.(REGADERA FIJA ECOLOGICA TIENE UN CAUDAL DE DESCARGA PROMEDIO DE 345 I/MIN EN EL LIMITE INFERIOR).",
    "last_date": 20211224,
    "hscode": [
      {
        "name": "39221001",
        "count": 240
      }
    ]
  },
  {
    "id": 8,
    "company": "TRUPER HERRAMIENTAS SA DE CV",
    "company_cn": "",
    "doc_count": 230,
    "trade_count": 2,
    "weight": 1706918.07,
    "qty": 366235.66,
    "price": 3265942.07,
    "country": [
      {
        "country_id": 6,
        "count": 230
      }
    ],
    "info": "REGADERA CON CABEZA CUADRADA DE ABS 8 PULGADAS CON BRAZO",
    "last_date": 20211230,
    "hscode": [
      {
        "name": "39221001",
        "count": 230
      }
    ]
  },
  {
    "id": 9,
    "company": "TOTO INDIA INDUSTRIES PVT LTD",
    "company_cn": "",
    "doc_count": 229,
    "trade_count": 6,
    "weight": 0,
    "qty": 22268.48,
    "price": 576078.73,
    "country": [
      {
        "country_id": 8,
        "count": 229
      }
    ],
    "info": "ACRYLIC FREE STANDING BATHTUB   ITEM CODE: PAY1717CPTE#W     TOTO SANITARYWARE & FITTINGS  - 2 PCS",
    "last_date": 20211224,
    "hscode": [
      {
        "name": "39221000",
        "count": 229
      }
    ]
  },
  {
    "id": 10,
    "company": "RIVELSA S.A.C",
    "company_cn": "",
    "doc_count": 227,
    "trade_count": 7,
    "weight": 16311.86,
    "qty": 344,
    "price": 175583,
    "country": [
      {
        "country_id": 10,
        "count": 227
      }
    ],
    "info": "TINA DE BA?O,KOHLER,95337-0, SPECTACLE 60?? FS FLUTED SHROUD BATH ONLY PARA USOS SANITARIOS TINA DE BA?O ,COD.PRODUCTO: 95337-0",
    "last_date": 20211224,
    "hscode": [
      {
        "name": "3922109000",
        "count": 226
      },
      {
        "name": "3922101000",
        "count": 1
      }
    ]
  },
  {
    "id": 11,
    "company": "PT SURYA TOTO INDONESIA TBK",
    "company_cn": "",
    "doc_count": 218,
    "trade_count": 8,
    "weight": 68154.61,
    "qty": 265389,
    "price": 1416751.63,
    "country": [
      {
        "country_id": 47,
        "count": 218
      }
    ],
    "info": "1 MODE SHOWER (KONDISI BARU)",
    "last_date": 20210924,
    "hscode": [
      {
        "name": "39221090",
        "count": 218
      }
    ]
  },
  {
    "id": 12,
    "company": "NGOC HUONG TRADING AND SERVICE COMPANY LIMITED",
    "company_cn": "",
    "doc_count": 210,
    "trade_count": 3,
    "weight": 0,
    "qty": 654,
    "price": 138520.12,
    "country": [
      {
        "country_id": 286,
        "count": 210
      }
    ],
    "info": "Independent canopy bathtub, no acrylic plastic foot, no massage function without faucet valve accessories, brand: bellux, code: 001, KT: 1500 * 580 * 700mm, 100% new, NSX: Shenzhen Step of I & E Trade CO., LTD",
    "last_date": 20211229,
    "hscode": [
      {
        "name": "39221011",
        "count": 210
      }
    ]
  },
  {
    "id": 13,
    "company": "CEVA",
    "company_cn": "",
    "doc_count": 206,
    "trade_count": 3,
    "weight": 656655,
    "qty": 22842,
    "price": 0,
    "country": [
      {
        "country_id": 11,
        "count": 206
      }
    ],
    "info": "ACRYLIC BATH TUB PO#509169 HS-CODE 392210 1)GROUP A 2)FREIGHT PREPAID (DEST CHGS COLLECT AT CAMTR) PPDCC",
    "last_date": 20211224,
    "hscode": [
      {
        "name": "392210",
        "count": 206
      }
    ]
  },
  {
    "id": 14,
    "company": "ИП \"ТЕРЕЩЕНКО\"",
    "company_cn": "",
    "doc_count": 194,
    "trade_count": 1,
    "weight": 725479,
    "qty": 0,
    "price": 1831234.11,
    "country": [
      {
        "country_id": 21,
        "count": 194
      }
    ],
    "info": "1. ДУШЕВОЙ ПОДДОН,   ",
    "last_date": 20211229,
    "hscode": [
      {
        "name": "3922100000",
        "count": 194
      }
    ]
  },
  {
    "id": 15,
    "company": "GERARDO ORTIZ E HIJOS CIA LTDA",
    "company_cn": "",
    "doc_count": 187,
    "trade_count": 9,
    "weight": 110499.32,
    "qty": 72242,
    "price": 459849.75,
    "country": [
      {
        "country_id": 13,
        "count": 187
      }
    ],
    "info": "CABEZA DUCHA",
    "last_date": 20211216,
    "hscode": [
      {
        "name": "3922109000",
        "count": 184
      },
      {
        "name": "3922101000",
        "count": 3
      }
    ]
  },
  {
    "id": 16,
    "company": "CORPORACION EL ROSADO S.A",
    "company_cn": "",
    "doc_count": 160,
    "trade_count": 10,
    "weight": 51079.17,
    "qty": 57626,
    "price": 464064.71,
    "country": [
      {
        "country_id": 13,
        "count": 160
      }
    ],
    "info": "DUCHA PORTATIL P/CAMPING 20L",
    "last_date": 20211203,
    "hscode": [
      {
        "name": "3922109000",
        "count": 125
      },
      {
        "name": "3922101000",
        "count": 35
      }
    ]
  },
  {
    "id": 17,
    "company": "SHREE ENTERPRISES LIMITED",
    "company_cn": "",
    "doc_count": 154,
    "trade_count": 14,
    "weight": 34262,
    "qty": 32168,
    "price": 189105.28,
    "country": [
      {
        "country_id": 249,
        "count": 154
      }
    ],
    "info": "Baths, shower-baths and wash-basins, of plastics JAQUAR OVERHEAD SHOWER 190MM DIA ROUND SHAPE SINGLE FLOW",
    "last_date": 20211230,
    "hscode": [
      {
        "name": "39221000000",
        "count": 154
      }
    ]
  },
  {
    "id": 18,
    "company": "ООО \"IN FAZO\"",
    "company_cn": "",
    "doc_count": 152,
    "trade_count": 2,
    "weight": 132908.2,
    "qty": 0,
    "price": 4036635.99,
    "country": [
      {
        "country_id": 250,
        "count": 152
      }
    ],
    "info": "1. Душевая кабина из пластмассы в комплекте: ДК \"Стандарт 90*90 А\" 1/4 круга, низ. подд., Аква, Мозаика, Белый, ДН4 (7 мест+сифон D90мм) в частично разобранном виде, кол-во 10 шт/компл. Производитель:ООО \"ТРИТОН\". (ТЗ) TRITON.-Вес 734,6 кг. \n2. Часть  (ч",
    "last_date": 20211210,
    "hscode": [
      {
        "name": "3922100000",
        "count": 152
      }
    ]
  },
  {
    "id": 19,
    "company": "AMERICAN SATNDARD B&K S.DE R.L. DE C.V",
    "company_cn": "",
    "doc_count": 148,
    "trade_count": 2,
    "weight": 383414.27,
    "qty": 10290.98,
    "price": 245874.12,
    "country": [
      {
        "country_id": 6,
        "count": 148
      }
    ],
    "info": "REGADERAS (DUCHAS) PLASTICAS * 26046002",
    "last_date": 20211229,
    "hscode": [
      {
        "name": "39221001",
        "count": 148
      }
    ]
  },
  {
    "id": 20,
    "company": "UNIPACK COLOMBIA SAS CALLE",
    "company_cn": "",
    "doc_count": 148,
    "trade_count": 1,
    "weight": 148000,
    "qty": 0,
    "price": 3579988.09,
    "country": [
      {
        "country_id": 238,
        "count": 79
      },
      {
        "country_id": 214,
        "count": 69
      }
    ],
    "info": "SHOWER (1PC/CTN)",
    "last_date": 20211224,
    "hscode": [
      {
        "name": "3922100000",
        "count": 148
      }
    ]
  }
];
// 根据参数生成Promise的函数、一般为根据传入的url构造一个Promise，其内部封装一个异步请求
const promiseFn = (item) => {
  return new Promise((resolve, reject) => {
    console.log(`开始生成${item}的异步请求          ····`);
    // 模拟异步请求
    // setTimeout(() => {
    console.log(item);
    // 得到结果
    resolve(item);
    console.log(`${item}的异步请求执行完毕            √`);
    // }, Math.random() * 1000);
  });
};



// promiseFn返回一个封装了异步任务的promise
/* 
  arr 需要遍历的数组
  resArr 每个promise的结果保存到数组
*/
exports.promiseAll = (arr = [], resArr = [], promiseFn, limit) => {

  // 当前正在遍历的坐标
  let index = 0;
  // 存放结果的数组
  let res = [];
  // 正在执行的数组
  let excuting = [];


  // 执行函数
  function enqueue() {
    // 当执行完毕之后返回resolve状态的promise
    if (index === arr.length) {
      return Promise.resolve();
    }
    const curIndex = index++ 
    // 依次取出一个元素
    // 网络请求传入的参数
    const item = arr[curIndex]?.company || arr[curIndex];
    console.log('请求item', item)
    /* 此处then方法会立即返回一个promise,在then回调运行结束
    （promise生成完毕）之后才会变成resolved状态，且当时的promise与
    promiseFn生成的promise保持一致(1、状态一致；2、resolve或者reject的值一致)*/
    const p = Promise.resolve().then(() => promiseFn(item, arr, resArr));
    // 将其放到promise数组
    res.push(p);

    // 将e放入正在执行的数组，并且在p执行完成之后将当前执行的e删除掉
    const e = p.then(() => {
      excuting.splice(excuting.indexOf(e), 1);
    });
    excuting.push(e);

    // 让r为一个默认resolved状态的promise
    let r = Promise.resolve();
    // 如果执行数组满了的话，那就让r通过race等待改变状态
    if (excuting.length >= limit) {
      r = Promise.race(excuting);
    }
    // 等到r变为resolved状态（执行数组没满或者有一个已经执行完被删除了）再来递归调用enqueue
    return r.then(() => enqueue());
  }

  // 执行完成后，通过promise.all返回所有的结果
  return enqueue().then(() => {
    // const reuslt = Promise.all(res)
    console.log(`当前${index} Promise 队列结束`, )
    return Promise.all(res)
  })
}




// modules.exports= {
//   promiseAll
// }
// (async () => {
//   const reuslt = await promiseAll(array, promiseFn, limit)
//   console.log('reuslt', reuslt);

// })()
