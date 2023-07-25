var nameMap = {
    'Afghanistan':'阿富汗',
    'Albania':'阿尔巴尼亚',
    'Algeria':'阿尔及利亚',
    'Andorra':'安道尔',
    'Angola':'安哥拉',
    'Antarctica':'南极洲',
    'Antigua and Barbuda':'安提瓜和巴布达',
    'Argentina':'阿根廷',
    'Armenia':'亚美尼亚',
    'Australia':'澳大利亚',
    'Austria':'奥地利',
    'Azerbaijan':'阿塞拜疆',
    'The Bahamas':'巴哈马',
    'Bahrain':'巴林',
    'Bangladesh':'孟加拉国',
    'Barbados':'巴巴多斯',
    'Belarus':'白俄罗斯',
    'Belgium':'比利时',
    'Belize':'伯利兹',
    'Benin':'贝宁',
    'Bermuda':'百慕大',
    'Bhutan':'不丹',
    'Bolivia':'玻利维亚',
    'Bosnia and Herzegovina':'波斯尼亚和黑塞哥维那',
    'Botswana':'博茨瓦纳',
    'Brazil':'巴西',
    'Brunei':'文莱',
    'Bulgaria':'保加利亚',
    'Burkina Faso':'布基纳法索',
    'Burundi':'布隆迪',
    'Cambodia':'柬埔寨',
    'Cameroon':'喀麦隆',
    'Canada':'加拿大',
    'Cape Verde':'佛得角',
    'Central African Republic':'中非共和国',
    'Chad':'乍得',
    'Chile':'智利',
    'China':'中国',
    'Colombia':'哥伦比亚',
    'Comoros':'科摩罗',
    'Republic of the Congo':'刚果共和国',
    'Costa Rica':'哥斯达黎加',
    'Croatia':'克罗地亚',
    'Cuba':'古巴',
    'Cyprus':'塞浦路斯',
    'Czech Republic':'捷克共和国',
    'Denmark':'丹麦',
    'Djibouti':'吉布提',
    'Dominica':'多米尼加',
    'Dominican Republic':'多明尼加共和国',
    'Ecuador':'厄瓜多尔',
    'Egypt':'埃及',
    'El Salvador':'萨尔瓦多',
    'Equatorial Guinea':'赤道几内亚',
    'Eritrea':'厄立特里亚',
    'Estonia':'爱沙尼亚',
    'Ethiopia':'埃塞俄比亚',
    'Falkland Islands':'福克兰群岛',
    'Faroe Islands':'法罗群岛',
    'Fiji':'斐济',
    'Finland':'芬兰',
    'France':'法国',
    'French Guiana':'法属圭亚那',
    'French Southern and Antarctic Lands':'法属南半球和南极领地',
    'Gabon':'加蓬',
    'Gambia':'冈比亚',
    'Gaza Strip':'加沙',
    'Georgia':'格鲁吉亚',
    'Germany':'德国',
    'Ghana':'加纳',
    'Greece':'希腊',
    'Greenland':'格陵兰',
    'Grenada':'格林纳达',
    'Guadeloupe':'瓜德罗普',
    'Guatemala':'危地马拉',
    'Guinea':'几内亚',
    'Guinea Bissau':'几内亚比绍',
    'Guyana':'圭亚那',
    'Haiti':'海地',
    'Honduras':'洪都拉斯',
    'Hong Kong':'香港',
    'Hungary':'匈牙利',
    'Iceland':'冰岛',
    'India':'印度',
    'Indonesia':'印度尼西亚',
    'Iran':'伊朗',
    'Iraq':'伊拉克',
    'Iraq-Saudi Arabia Neutral Zone':'伊拉克阿拉伯中立区',
    'Ireland':'爱尔兰',
    'Isle of Man':'马恩岛',
    'Israel':'以色列',
    'Italy':'意大利',
    'Ivory Coast':'科特迪瓦',
    'Jamaica':'牙买加',
    'Jan Mayen':'扬马延岛',
    'Japan':'日本',
    'Jordan':'约旦',
    'Kazakhstan':'哈萨克斯坦',
    'Kenya':'肯尼亚',
    'Kerguelen':'凯尔盖朗群岛',
    'Kiribati':'基里巴斯',
    'North Korea':'北朝鲜',
    'South Korea':'韩国',
    'Kuwait':'科威特',
    'Kyrgyzstan':'吉尔吉斯斯坦',
    'Laos':'老挝',
    'Latvia':'拉脱维亚',
    'Lebanon':'黎巴嫩',
    'Lesotho':'莱索托',
    'Liberia':'利比里亚',
    'Libya':'利比亚',
    'Liechtenstein':'列支敦士登',
    'Lithuania':'立陶宛',
    'Luxembourg':'卢森堡',
    'Macau':'澳门',
    'Macedonia':'马其顿',
    'Madagascar':'马达加斯加',
    'Malawi':'马拉维',
    'Malaysia':'马来西亚',
    'Maldives':'马尔代夫',
    'Mali':'马里',
    'Malta':'马耳他',
    'Martinique':'马提尼克',
    'Mauritania':'毛里塔尼亚',
    'Mauritius':'毛里求斯',
    'Mexico(Sea Shipping)':'墨西哥',
    'Moldova':'摩尔多瓦',
    'Monaco':'摩纳哥',
    'Mongolia':'蒙古',
    'Morocco':'摩洛哥',
    'Mozambique':'莫桑比克',
    'Myanmar':'缅甸',
    'Namibia':'纳米比亚',
    'Nepal':'尼泊尔',
    'Netherlands':'荷兰',
    'New Caledonia':'新喀里多尼亚',
    'New Zealand':'新西兰',
    'Nicaragua':'尼加拉瓜',
    'Niger':'尼日尔',
    'Nigeria':'尼日利亚',
    'Northern Mariana Islands':'北马里亚纳群岛',
    'Norway':'挪威',
    'Oman':'阿曼',
    'Pakistan(Lading Bill)':'巴基斯坦',
		"Vietnam(Frontier Trade)":"越南(边贸)",
    "Vietnam(All Ports)":"越南(全港)",
    'Panama':'巴拿马',
    'Papua New Guinea':'巴布亚新几内亚',
    'Paraguay':'巴拉圭',
    'Peru':'秘鲁',
    'Philippines':'菲律宾',
    'Poland':'波兰',
    'Portugal':'葡萄牙',
    'Puerto Rico':'波多黎各',
    'Qatar':'卡塔尔',
    'Reunion':'留尼旺岛',
    'Romania':'罗马尼亚',
    'Russia':'俄罗斯',
    'Rwanda':'卢旺达',
    'San Marino':'圣马力诺',
    'Sao Tome and Principe':'圣多美和普林西比',
    'Saudi Arabia':'沙特阿拉伯',
    'Senegal':'塞内加尔',
    'Seychelles':'塞舌尔',
    'Sierra Leone':'塞拉利昂',
    'Singapore':'新加坡',
    'Slovakia':'斯洛伐克',
    'Slovenia':'斯洛文尼亚',
    'Solomon Islands':'所罗门群岛',
    'Somalia':'索马里',
    'South Africa':'南非',
    'Spain':'西班牙',
    'Sri Lanka':'斯里兰卡',
    'St. Christopher-Nevis':'圣',
    'St. Lucia':'圣露西亚',
    'St. Vincent and the Grenadines':'圣文森特和格林纳丁斯',
    'Sudan':'苏丹',
    'Suriname':'苏里南',
    'Svalbard':'斯瓦尔巴特群岛',
    'Swaziland':'斯威士兰',
    'Sweden':'瑞典',
    'Switzerland':'瑞士',
    'Syria':'叙利亚',
    'Taiwan':'台湾',
    'Tajikistan':'塔吉克斯坦',
    'United Republic of Tanzania':'坦桑尼亚',
    'Thailand':'泰国',
    'Togo':'多哥',
    'Tonga':'汤加',
    'Trinidad and Tobago':'特里尼达和多巴哥',
    'Tunisia':'突尼斯',
    'Turkey':'土耳其',
    'Turkmenistan':'土库曼斯坦',
    'Turks and Caicos Islands':'特克斯和凯科斯群岛',
    'Uganda':'乌干达',
    'Ukraine':'乌克兰',
    'United Arab Emirates':'阿联酋',
    'United Kingdom':'英国',
    'United States':'美国',
    'Uruguay':'乌拉圭',
    'Uzbekistan':'乌兹别克斯坦',
    'Vanuatu':'瓦努阿图',
    'Venezuela':'委内瑞拉',
    'Vietnam':'越南',
    'Western Sahara':'西撒哈拉',
    'Western Samoa':'西萨摩亚',
    'Yemen':'也门',
    'Yugoslavia':'南斯拉夫',
    'Democratic Republic of the Congo':'刚果民主共和国',
    'Zambia':'赞比亚',
    'Zimbabwe':'津巴布韦',
    'South Sudan':'南苏丹',
    'Somaliland':'索马里兰',
    'Montenegro':'黑山',
    'Kosovo':'科索沃',
    'Republic of Serbia':'塞尔维亚',
    'HongKong,China':'中国香港',
    'Macao,china':'中国澳门',
    'Taiwan,china':'中国台湾'
    };

var continent_other = [

    {
        "name": "\u5317\u7f8e\u6d32",
        "name_en": "North America",
        "country_id": "501",
        "children": [
            {
                "country_id": "11",
                "country_name": "\u7f8e\u56fd",
                "country_en": "America",
                "color": "true"
            },
            {
                "country_id": "50",
                "country_name": "\u52a0\u62ff\u5927",
                "country_en": "Canada",
                "color": "true"
            },
            {
                "country_id": "6",
                "country_name": "\u58a8\u897f\u54e5(\u63d0\u5355) ",
                "country_en": "Mexico(Sea Shipping)",
                "color": "true"
            },
            {
                "country_id": "283",
                "country_name": "\u58a8\u897f\u54e5(\u6d77\u3001\u9646\u3001\u7a7a)",
                "country_en": "Mexico(All Shipping)",
                "color": "true"
            },
            {
                "country_id": "70",
                "country_name": "\u963f\u9c81\u5df4",
                "country_en": "Aruba",
                "color": "true"
            },
            {
                "country_id": "81",
                "country_name": "\u5df4\u5df4\u591a\u65af",
                "country_en": "Barbados",
                "color": "true"
            },
            {
                "country_id": "91",
                "country_name": "\u6ce2\u591a\u9ece\u5404",
                "country_en": "Puerto Rico",
                "color": "true"
            },
            {
                "country_id": "103",
                "country_name": "\u591a\u7c73\u5c3c\u52a0\u5171\u548c\u56fd",
                "country_en": "The Dominican Republic",
                "color": "true"
            },
            {
                "country_id": "104",
                "country_name": "\u591a\u7c73\u5c3c\u514b",
                "country_en": "Dominica",
                "color": "true"
            },
            {
                "country_id": "122",
                "country_name": "\u683c\u6797\u7eb3\u8fbe",
                "country_en": "Grenada",
                "color": "true"
            },
            {
                "country_id": "123",
                "country_name": "\u683c\u9675\u5170\u5c9b",
                "country_en": "Greenland",
                "color": "true"
            },
            {
                "country_id": "129",
                "country_name": "\u6d77\u5730",
                "country_en": "Haiti",
                "color": "true"
            },
            {
                "country_id": "132",
                "country_name": "\u6d2a\u90fd\u62c9\u65af",
                "country_en": "Honduras",
                "color": "true"
            },
            {
                "country_id": "206",
                "country_name": "\u58a8\u897f\u54e5\u6e7e",
                "country_en": "Gulf of Mexico",
                "color": "true"
            },
            {
                "country_id": "212",
                "country_name": "\u5c3c\u52a0\u62c9\u74dc",
                "country_en": "Nicaragua",
                "color": "true"
            },
            {
                "country_id": "219",
                "country_name": "\u8428\u5c14\u74e6\u591a",
                "country_en": "Salvatore",
                "color": "true"
            },
            {
                "country_id": "231",
                "country_name": "\u5723\u6587\u68ee\u7279\u548c\u683c\u6797\u7eb3\u4e01\u65af",
                "country_en": "Saint Vincent and the Grenadines",
                "color": "true"
            },
            {
                "country_id": "241",
                "country_name": "\u7279\u7acb\u5c3c\u8fbe\u548c\u591a\u5df4\u54e5",
                "country_en": "Trinidad and Tobago",
                "color": "true"
            },
            {
                "country_id": "254",
                "country_name": "\u7259\u4e70\u52a0",
                "country_en": "Jamaica",
                "color": "true"
            }
        ]
    },
    {
        "name": "\u5927\u6d0b\u6d32",
        "name_en": "Oceania",
        "country_id": "502",
        "children": [
            {
                "country_id": "25",
                "country_name": "\u65b0\u897f\u5170",
                "country_en": "New Zealand",
                "color": "true"
            },
            {
                "country_id": "78",
                "country_name": "\u6fb3\u5927\u5229\u4e9a",
                "country_en": "Australia",
                "color": "true"
            },
            {
                "country_id": "82",
                "country_name": "\u5df4\u5e03\u4e9a\u65b0\u51e0\u5185\u4e9a",
                "country_en": "papua new guinea",
                "color": "true"
            },
            {
                "country_id": "93",
                "country_name": "\u73bb\u5229\u5c3c\u897f\u4e9a",
                "country_en": "Polynesia",
                "color": "true"
            },
            {
                "country_id": "116",
                "country_name": "\u6590\u6d4e",
                "country_en": "Fiji",
                "color": "true"
            },
            {
                "country_id": "126",
                "country_name": "\u5173\u5c9b(\u7f8e\u56fd)",
                "country_en": "Guam",
                "color": "true"
            },
            {
                "country_id": "134",
                "country_name": "\u57fa\u91cc\u5df4\u65af",
                "country_en": "Kiribati",
                "color": "true"
            },
            {
                "country_id": "166",
                "country_name": "\u9a6c\u7ecd\u5c14\u7fa4\u5c9b",
                "country_en": "Marshall Islands",
                "color": "true"
            },
            {
                "country_id": "177",
                "country_name": "\u5bc6\u514b\u7f57\u5c3c\u897f\u4e9a",
                "country_en": "Micronesia",
                "color": "true"
            },
            {
                "country_id": "210",
                "country_name": "\u7459\u9c81",
                "country_en": "Nauru",
                "color": "true"
            },
            {
                "country_id": "215",
                "country_name": "\u7ebd\u57c3",
                "country_en": "Niue",
                "color": "true"
            },
            {
                "country_id": "218",
                "country_name": "\u5e15\u52b3",
                "country_en": "Palau",
                "color": "true"
            },
            {
                "country_id": "220",
                "country_name": "\u8428\u6469\u4e9a",
                "country_en": "Samoa",
                "color": "true"
            },
            {
                "country_id": "235",
                "country_name": "\u6240\u7f57\u95e8\u7fa4\u5c9b",
                "country_en": "Solomon Islands",
                "color": "true"
            },
            {
                "country_id": "245",
                "country_name": "\u74e6\u52aa\u963f\u56fe",
                "country_en": "Vanuatu",
                "color": "true"
            }
        ]
    },
    {
        "name": "\u975e\u6d32",
        "name_en": "Africa",
        "country_id": "503",
        "children": [
            {
                "country_id": "41",
                "country_name": "\u5357\u975e",
                "country_en": "South Africa",
                "color": "true"
            },
            {
                "country_id": "73",
                "country_name": "\u57c3\u585e\u4fc4\u6bd4\u4e9a",
                "country_en": "Ethiopia",
                "color": "true"
            },
            {
                "country_id": "75",
                "country_name": "\u5b89\u54e5\u62c9",
                "country_en": "Angola",
                "color": "true"
            },
            {
                "country_id": "89",
                "country_name": "\u8d1d\u5b81",
                "country_en": "Benin",
                "color": "true"
            },
            {
                "country_id": "96",
                "country_name": "\u535a\u8328\u74e6\u7eb3",
                "country_en": "botswana",
                "color": "true"
            },
            {
                "country_id": "98",
                "country_name": "\u5e03\u5409\u7eb3\u6cd5\u7d22",
                "country_en": "Buji Faso",
                "color": "true"
            },
            {
                "country_id": "99",
                "country_name": "\u5e03\u9686\u8fea",
                "country_en": "Burundi",
                "color": "true"
            },
            {
                "country_id": "101",
                "country_name": "\u8d64\u9053\u51e0\u5185\u4e9a",
                "country_en": "Equatorial Guinea",
                "color": "true"
            },
            {
                "country_id": "102",
                "country_name": "\u591a\u54e5",
                "country_en": "Togo",
                "color": "true"
            },
            {
                "country_id": "105",
                "country_name": "\u5384\u7acb\u7279\u91cc\u4e9a",
                "country_en": "Eritrea",
                "color": "true"
            },
            {
                "country_id": "119",
                "country_name": "\u5188\u6bd4\u4e9a",
                "country_en": "Gambia",
                "color": "true"
            },
            {
                "country_id": "121",
                "country_name": "\u521a\u679c",
                "country_en": "Congo",
                "color": "true"
            },
            {
                "country_id": "135",
                "country_name": "\u5409\u5e03\u63d0",
                "country_en": "Djibouti",
                "color": "true"
            },
            {
                "country_id": "137",
                "country_name": "\u51e0\u5185\u4e9a",
                "country_en": "Guinea",
                "color": "true"
            },
            {
                "country_id": "138",
                "country_name": "\u51e0\u5185\u4e9a\u6bd4\u7ecd",
                "country_en": "Guinea Bissau",
                "color": "true"
            },
            {
                "country_id": "139",
                "country_name": "\u52a0\u7eb3",
                "country_en": "Ghana",
                "color": "true"
            },
            {
                "country_id": "140",
                "country_name": "\u52a0\u84ec",
                "country_en": "Gabon",
                "color": "true"
            },
            {
                "country_id": "142",
                "country_name": "\u6d25\u5df4\u5e03\u97e6",
                "country_en": "zimbabwe",
                "color": "true"
            },
            {
                "country_id": "143",
                "country_name": "\u5580\u9ea6\u9686",
                "country_en": "Cameroon",
                "color": "true"
            },
            {
                "country_id": "145",
                "country_name": "\u79d1\u6469\u7f57",
                "country_en": "Comores",
                "color": "true"
            },
            {
                "country_id": "147",
                "country_name": "\u79d1\u7279\u8fea\u74e6",
                "country_en": "Cote d'Ivoire",
                "color": "true"
            },
            {
                "country_id": "149",
                "country_name": "\u80af\u5c3c\u4e9a",
                "country_en": "Kenya",
                "color": "true"
            },
            {
                "country_id": "152",
                "country_name": "\u83b1\u7d22\u6258",
                "country_en": "Lesotho",
                "color": "true"
            },
            {
                "country_id": "155",
                "country_name": "\u5229\u6bd4\u91cc\u4e9a",
                "country_en": "Liberia",
                "color": "true"
            },
            {
                "country_id": "159",
                "country_name": "\u5362\u65fa\u8fbe",
                "country_en": "Rwanda",
                "color": "true"
            },
            {
                "country_id": "160",
                "country_name": "\u9a6c\u8fbe\u52a0\u65af\u52a0",
                "country_en": "Madagascar",
                "color": "true"
            },
            {
                "country_id": "163",
                "country_name": "\u9a6c\u62c9\u7ef4",
                "country_en": "Malawi",
                "color": "true"
            },
            {
                "country_id": "164",
                "country_name": "\u9a6c\u91cc",
                "country_en": "Mali",
                "color": "true"
            },
            {
                "country_id": "167",
                "country_name": "\u6bdb\u91cc\u6c42\u65af",
                "country_en": "Mauritius",
                "color": "true"
            },
            {
                "country_id": "168",
                "country_name": "\u6bdb\u91cc\u5854\u5c3c\u4e9a",
                "country_en": "Mauritania",
                "color": "true"
            },
            {
                "country_id": "205",
                "country_name": "\u83ab\u6851\u6bd4\u514b",
                "country_en": "Mozambique",
                "color": "true"
            },
            {
                "country_id": "207",
                "country_name": "\u7eb3\u7c73\u6bd4\u4e9a",
                "country_en": "Namibia",
                "color": "true"
            },
            {
                "country_id": "213",
                "country_name": "\u5c3c\u65e5\u5c14",
                "country_en": "Niger",
                "color": "true"
            },
            {
                "country_id": "214",
                "country_name": "\u5c3c\u65e5\u5229\u4e9a",
                "country_en": "Nigeria",
                "color": "true"
            },
            {
                "country_id": "222",
                "country_name": "\u585e\u62c9\u5229\u6602",
                "country_en": "sierra leone",
                "color": "true"
            },
            {
                "country_id": "223",
                "country_name": "\u585e\u5185\u52a0\u5c14",
                "country_en": "Senegal",
                "color": "true"
            },
            {
                "country_id": "225",
                "country_name": "\u585e\u820c\u5c14",
                "country_en": "Seychelles",
                "color": "true"
            },
            {
                "country_id": "232",
                "country_name": "\u65af\u5a01\u58eb\u5170",
                "country_en": "Swaziland",
                "color": "true"
            },
            {
                "country_id": "233",
                "country_name": "\u82cf\u4e39",
                "country_en": "Sudan",
                "color": "true"
            },
            {
                "country_id": "236",
                "country_name": "\u7d22\u9a6c\u91cc",
                "country_en": "Somalia",
                "color": "true"
            },
            {
                "country_id": "238",
                "country_name": "\u5766\u6851\u5c3c\u4e9a",
                "country_en": "Tanzania",
                "color": "true"
            },
            {
                "country_id": "249",
                "country_name": "\u4e4c\u5e72\u8fbe",
                "country_en": "Uganda",
                "color": "true"
            },
            {
                "country_id": "266",
                "country_name": "\u8d5e\u6bd4\u4e9a",
                "country_en": "Zambia",
                "color": "true"
            },
            {
                "country_id": "267",
                "country_name": "\u624e\u4f0a\u5c14",
                "country_en": "zaire",
                "color": "true"
            },
            {
                "country_id": "268",
                "country_name": "\u4e4d\u5f97",
                "country_en": "Chad",
                "color": "true"
            },
            {
                "country_id": "269",
                "country_name": "\u4e2d\u975e\u5171\u548c\u56fd",
                "country_en": "The Central African Republic",
                "color": "true"
            }
        ]
    },
    {
        "name": "\u5357\u7f8e\u6d32",
        "name_en": "South America",
        "country_id": "504",
        "children": [
            {
                "country_id": "3",
                "country_name": "\u4e4c\u62c9\u572d",
                "country_en": "Uruguay",
                "color": "true"
            },
            {
                "country_id": "4",
                "country_name": "\u59d4\u5185\u745e\u62c9",
                "country_en": "Venezuela",
                "color": "true"
            },
            {
                "country_id": "5",
                "country_name": "\u54e5\u65af\u8fbe\u9ece\u52a0",
                "country_en": "CostaRica",
                "color": "true"
            },
            {
                "country_id": "246",
                "country_name": "\u5371\u5730\u9a6c\u62c9",
                "country_en": "Guatemala",
                "color": "true"
            },
            {
                "country_id": "83",
                "country_name": "\u5df4\u54c8\u9a6c",
                "country_en": "Bahamas",
                "color": "true"
            },
            {
                "country_id": "7",
                "country_name": "\u667a\u5229",
                "country_en": "Chile",
                "color": "true"
            },
            {
                "country_id": "10",
                "country_name": "\u79d8\u9c81",
                "country_en": "Peru",
                "color": "true"
            },
            {
                "country_id": "12",
                "country_name": "\u54e5\u4f26\u6bd4\u4e9a",
                "country_en": "Columbia",
                "color": "true"
            },
            {
                "country_id": "13",
                "country_name": "\u5384\u74dc\u591a\u5c14",
                "country_en": "Ecuador",
                "color": "true"
            },
            {
                "country_id": "15",
                "country_name": "\u5df4\u62ff\u9a6c",
                "country_en": "Panama",
                "color": "true"
            },
            {
                "country_id": "17",
                "country_name": "\u5df4\u62c9\u572d",
                "country_en": "Paraguay",
                "color": "true"
            },
            {
                "country_id": "18",
                "country_name": "\u963f\u6839\u5ef7",
                "country_en": "Argentina",
                "color": "true"
            },
            {
                "country_id": "77",
                "country_name": "\u5b89\u63d0\u74dc\u548c\u5df4\u5e03\u8fbe(\u82f1\u56fd)",
                "country_en": "Antigua and Barbuda",
                "color": "true"
            },
            {
                "country_id": "86",
                "country_name": "\u5df4\u62ff\u9a6c\u8fd0\u6cb3\u533a",
                "country_en": "Panama Canal Zone",
                "color": "true"
            },
            {
                "country_id": "87",
                "country_name": "\u5df4\u897f",
                "country_en": "Brazil",
                "color": "true"
            },
            {
                "country_id": "94",
                "country_name": "\u73bb\u5229\u7ef4\u4e9a",
                "country_en": "Bolivia",
                "color": "true"
            },
            {
                "country_id": "95",
                "country_name": "\u4f2f\u5229\u5179",
                "country_en": "Belize",
                "color": "true"
            },
            {
                "country_id": "125",
                "country_name": "\u53e4\u5df4",
                "country_en": "Cuba",
                "color": "true"
            },
            {
                "country_id": "127",
                "country_name": "\u572d\u4e9a\u90a3",
                "country_en": "Guyana",
                "color": "true"
            },
            {
                "country_id": "227",
                "country_name": "\u5723\u57fa\u8328\u548c\u5c3c\u7ef4\u65af",
                "country_en": "San Kitts and Nevis",
                "color": "true"
            },
            {
                "country_id": "234",
                "country_name": "\u82cf\u91cc\u5357",
                "country_en": "Suriname",
                "color": "true"
            }
        ]
    },
    {
        "name": "\u6b27\u6d32",
        "name_en": "Europe",
        "country_id": "505",
        "children": [
            {
                "country_id": "2",
                "country_name": "\u82f1\u56fd",
                "country_en": "UK",
                "color": "true"
            },
            {
                "country_id": "9",
                "country_name": "\u4e4c\u514b\u5170",
                "country_en": "Ukraine",
                "color": "true"
            },
            {
                "country_id": "14",
                "country_name": "\u4fc4\u7f57\u65af",
                "country_en": "Russia",
                "color": "true"
            },
            {
                "country_id": "20",
                "country_name": "\u7231\u6c99\u5c3c\u4e9a",
                "country_en": "Estonia",
                "color": "true"
            },
            {
                "country_id": "22",
                "country_name": "\u7f57\u9a6c\u5c3c\u4e9a",
                "country_en": "Romania",
                "color": "true"
            },
            {
                "country_id": "23",
                "country_name": "\u745e\u58eb",
                "country_en": "Switzerland",
                "color": "true"
            },
            {
                "country_id": "24",
                "country_name": "\u5fb7\u56fd",
                "country_en": "Germany",
                "color": "true"
            },
            {
                "country_id": "26",
                "country_name": "\u610f\u5927\u5229",
                "country_en": "Italy",
                "color": "true"
            },
            {
                "country_id": "29",
                "country_name": "\u6cd5\u56fd",
                "country_en": "France",
                "color": "true"
            },
            {
                "country_id": "31",
                "country_name": "\u6bd4\u5229\u65f6",
                "country_en": "Belgium",
                "color": "true"
            },
            {
                "country_id": "32",
                "country_name": "\u897f\u73ed\u7259",
                "country_en": "Spain",
                "color": "true"
            },
            {
                "country_id": "33",
                "country_name": "\u5e0c\u814a",
                "country_en": "Greece",
                "color": "true"
            },
            {
                "country_id": "34",
                "country_name": "\u6ce2\u5170",
                "country_en": "poland",
                "color": "true"
            },
            {
                "country_id": "35",
                "country_name": "\u8461\u8404\u7259",
                "country_en": "Portugal",
                "color": "true"
            },
            {
                "country_id": "37",
                "country_name": "\u5965\u5730\u5229",
                "country_en": "Austria",
                "color": "true"
            },
            {
                "country_id": "38",
                "country_name": "\u6377\u514b",
                "country_en": "Czech Republic",
                "color": "true"
            },
            {
                "country_id": "40",
                "country_name": "\u8377\u5170",
                "country_en": "Netherlands",
                "color": "true"
            },
            {
                "country_id": "43",
                "country_name": "\u767d\u4fc4\u7f57\u65af",
                "country_en": "Belarus",
                "color": "true"
            },
            {
                "country_id": "44",
                "country_name": "\u65af\u6d1b\u6587\u5c3c\u4e9a",
                "country_en": "Slovenia",
                "color": "true"
            },
            {
                "country_id": "46",
                "country_name": "\u7231\u5c14\u5170",
                "country_en": "Ireland",
                "color": "true"
            },
            {
                "country_id": "55",
                "country_name": "\u5308\u7259\u5229",
                "country_en": "Hungary",
                "color": "true"
            },
            {
                "country_id": "57",
                "country_name": "\u632a\u5a01",
                "country_en": "Norway",
                "color": "true"
            },
            {
                "country_id": "58",
                "country_name": "\u4e39\u9ea6",
                "country_en": "Denmark",
                "color": "true"
            },
            {
                "country_id": "59",
                "country_name": "\u745e\u5178",
                "country_en": "Sweden",
                "color": "true"
            },
            {
                "country_id": "60",
                "country_name": "\u82ac\u5170",
                "country_en": "Finland",
                "color": "true"
            },
            {
                "country_id": "62",
                "country_name": "\u4fdd\u52a0\u5229\u4e9a",
                "country_en": "Bulgaria",
                "color": "true"
            },
            {
                "country_id": "63",
                "country_name": "\u6469\u5c14\u591a\u74e6",
                "country_en": "Moldova",
                "color": "true"
            },
            {
                "country_id": "64",
                "country_name": "\u514b\u7f57\u5730\u4e9a",
                "country_en": "Croatia",
                "color": "true"
            },
            {
                "country_id": "65",
                "country_name": "\u65af\u6d1b\u4f10\u514b",
                "country_en": "Slovakia",
                "color": "true"
            },
            {
                "country_id": "67",
                "country_name": "\u963f\u5e03\u54c8\u5179",
                "country_en": "Abkhazia",
                "color": "true"
            },
            {
                "country_id": "68",
                "country_name": "\u963f\u5c14\u5df4\u5c3c\u4e9a",
                "country_en": "Albania",
                "color": "true"
            },
            {
                "country_id": "74",
                "country_name": "\u5b89\u9053\u5c14",
                "country_en": "Andorra",
                "color": "true"
            },
            {
                "country_id": "90",
                "country_name": "\u51b0\u5c9b",
                "country_en": "Iceland",
                "color": "true"
            },
            {
                "country_id": "92",
                "country_name": "\u6ce2\u9ed1",
                "country_en": "Bosnia and Herzegovina",
                "color": "true"
            },
            {
                "country_id": "115",
                "country_name": "\u68b5\u8482\u5188\u57ce",
                "country_en": "Vatican City",
                "color": "true"
            },
            {
                "country_id": "146",
                "country_name": "\u79d1\u7d22\u6c83",
                "country_en": "Kosovo",
                "color": "true"
            },
            {
                "country_id": "151",
                "country_name": "\u62c9\u6258\u7ef4\u4e9a",
                "country_en": "Latvia",
                "color": "true"
            },
            {
                "country_id": "154",
                "country_name": "\u7acb\u9676\u5b9b",
                "country_en": "Lithuania",
                "color": "true"
            },
            {
                "country_id": "157",
                "country_name": "\u5217\u652f\u6566\u58eb\u767b",
                "country_en": "Liechtenstein",
                "color": "true"
            },
            {
                "country_id": "158",
                "country_name": "\u5362\u68ee\u5821",
                "country_en": "Luxembourg",
                "color": "true"
            },
            {
                "country_id": "162",
                "country_name": "\u9a6c\u8033\u4ed6",
                "country_en": "Malta",
                "color": "true"
            },
            {
                "country_id": "165",
                "country_name": "\u9a6c\u5176\u987f",
                "country_en": "Macedonia",
                "color": "true"
            },
            {
                "country_id": "204",
                "country_name": "\u6469\u7eb3\u54e5",
                "country_en": "Monaco",
                "color": "true"
            },
            {
                "country_id": "209",
                "country_name": "\u5357\u65af\u62c9\u592b",
                "country_en": "Yugoslavia",
                "color": "true"
            },
            {
                "country_id": "217",
                "country_name": "\u6b27\u76df",
                "country_en": "European Union",
                "color": "true"
            },
            {
                "country_id": "221",
                "country_name": "\u585e\u5c14\u7ef4\u4e9a\u548c\u9ed1\u5c71",
                "country_en": "Serbia and Montenegro",
                "color": "true"
            },
            {
                "country_id": "230",
                "country_name": "\u5723\u9a6c\u529b\u8bfa",
                "country_en": "San Marino",
                "color": "true"
            },
            {
                "country_id": "282",
                "country_name": "\u585e\u5c14\u7ef4\u4e9a",
                "country_en": "serbia",
                "color": "true"
            }
        ]
    },
    {
        "name": "\u4e9a\u6d32",
        "name_en": "Asia",
        "country_id": "506",
        "children": [
            {
                "country_id": "8",
                "country_name": "\u5370\u5ea6\u5168\u6e2f",
                "country_en": "India",
                "color": "true"
            },
            {
                "country_id": "281",
                "country_name": "\u5370\u5ea6JNPT",
                "country_en": "India(JNPT)",
                "color": "true"
            },
            {
                "country_id": "1",
                "country_name": "\u97e9\u56fd",
                "country_en": "South Korea",
                "color": "true"
            },
            {
                "country_id": "16",
                "country_name": "\u5df4\u57fa\u65af\u5766(\u63d0\u5355)",
                "country_en": "Pakistan(Lading Bill)",
                "color": "true"
            },
            {
                "country_id": "284",
                "country_name": "\u5df4\u57fa\u65af\u5766(\u5173\u5355)",
                "country_en": "Pakistan(Customs Bill)",
                "color": "true"
            },
            {
                "country_id": "19",
                "country_name": "\u4f0a\u6717",
                "country_en": "Iran",
                "color": "true"
            },
            {
                "country_id": "21",
                "country_name": "\u54c8\u8428\u514b\u65af\u5766",
                "country_en": "Kazakhstan",
                "color": "true"
            },
            {
                "country_id": "27",
                "country_name": "\u65b0\u52a0\u5761",
                "country_en": "Singapore",
                "color": "true"
            },
            {
                "country_id": "28",
                "country_name": "\u4e2d\u56fd\u9999\u6e2f",
                "country_en": "HongKong,China",
                "color": "true"
            },
            {
                "country_id": "47",
                "country_name": "\u5370\u5ea6\u5c3c\u897f\u4e9a",
                "country_en": "Indonesia",
                "color": "true"
            },
            {
                "country_id": "48",
                "country_name": "\u83f2\u5f8b\u5bbe",
                "country_en": "Philippines",
                "color": "true"
            },
            {
                "country_id": "51",
                "country_name": "\u6cf0\u56fd",
                "country_en": "Thailand",
                "color": "true"
            },
            {
                "country_id": "52",
                "country_name": "\u571f\u8033\u5176",
                "country_en": "Turkey",
                "color": "true"
            },
            {
                "country_id": "53",
                "country_name": "\u9a6c\u6765\u897f\u4e9a",
                "country_en": "Malaysia",
                "color": "true"
            },
            {
                "country_id": "54",
                "country_name": "\u4e2d\u56fd\u53f0\u6e7e",
                "country_en": "Taiwan,China",
                "color": "true"
            },
            {
                "country_id": "56",
                "country_name": "\u65e5\u672c",
                "country_en": "Japan",
                "color": "true"
            },
            {
                "country_id": "61",
                "country_name": "\u5409\u5c14\u5409\u65af\u65af\u5766",
                "country_en": "Kyrgyzstan",
                "color": "true"
            },
            {
                "country_id": "66",
                "country_name": "\u65af\u91cc\u5170\u5361",
                "country_en": "Sri Lanka",
                "color": "true"
            },
            {
                "country_id": "72",
                "country_name": "\u963f\u585e\u62dc\u7586",
                "country_en": "Azerbaijan",
                "color": "true"
            },
            {
                "country_id": "80",
                "country_name": "\u6fb3\u95e8",
                "country_en": "Macao,china",
                "color": "true"
            },
            {
                "country_id": "97",
                "country_name": "\u4e0d\u4e39",
                "country_en": "Bhutan",
                "color": "true"
            },
            {
                "country_id": "100",
                "country_name": "\u671d\u9c9c",
                "country_en": "North Korea",
                "color": "true"
            },
            {
                "country_id": "124",
                "country_name": "\u683c\u9c81\u5409\u4e9a",
                "country_en": "Georgia",
                "color": "true"
            },
            {
                "country_id": "141",
                "country_name": "\u67ec\u57d4\u5be8",
                "country_en": "Cambodia",
                "color": "true"
            },
            {
                "country_id": "153",
                "country_name": "\u8001\u631d",
                "country_en": "Laos",
                "color": "true"
            },
            {
                "country_id": "161",
                "country_name": "\u9a6c\u5c14\u4ee3\u592b",
                "country_en": "Maldives",
                "color": "true"
            },
            {
                "country_id": "175",
                "country_name": "\u8499\u53e4",
                "country_en": "Mongolia",
                "color": "true"
            },
            {
                "country_id": "176",
                "country_name": "\u5b5f\u52a0\u62c9\u56fd",
                "country_en": "Bangladesh",
                "color": "true"
            },
            {
                "country_id": "203",
                "country_name": "\u7f05\u7538",
                "country_en": "Myanmar",
                "color": "true"
            },
            {
                "country_id": "208",
                "country_name": "\u5357\u5965\u585e\u68af",
                "country_en": "South Ossetia",
                "color": "true"
            },
            {
                "country_id": "211",
                "country_name": "\u5c3c\u6cca\u5c14",
                "country_en": "Nepal",
                "color": "true"
            },
            {
                "country_id": "237",
                "country_name": "\u5854\u5409\u514b\u65af\u5766",
                "country_en": "Tajikistan",
                "color": "true"
            },
            {
                "country_id": "244",
                "country_name": "\u571f\u5e93\u66fc\u65af\u5766",
                "country_en": "Turkmenistan",
                "color": "true"
            },
            {
                "country_id": "248",
                "country_name": "\u6587\u83b1",
                "country_en": "Brunei",
                "color": "true"
            },
            {
                "country_id": "250",
                "country_name": "\u4e4c\u5179\u522b\u514b\u65af\u5766",
                "country_en": "Uzbekistan",
                "color": "true"
            },
            {
                "country_id": "255",
                "country_name": "\u4e9a\u7f8e\u5c3c\u4e9a",
                "country_en": "Armenia",
                "color": "true"
            },
            {
                "country_id": "265",
                "country_name": "\u8d8a\u5357(\u8fb9\u8d38)",
                "country_en": "Vietnam(Frontier Trade)",
                "color": "true"
            },
            {
                "country_id": "286",
                "country_name": "\u8d8a\u5357(\u5168\u6e2f)",
                "country_en": "Vietnam(All Ports)",
                "color": "true"
            },
            {
                "country_id": "270",
                "country_name": "\u4e2d\u56fd",
                "country_en": "China",
                "color": "true"
            }
        ]
    },
    {
        "name": "\u4e2d\u4e1c",
        "name_en": "Middle East",
        "country_id": "507",
        "children": [
            {
                "country_id": "30",
                "country_name": "\u963f\u62c9\u4f2f\u8054\u5408\u914b\u957f\u56fd",
                "country_en": "United Arab Emirates",
                "color": "true"
            },
            {
                "country_id": "36",
                "country_name": "\u57c3\u53ca",
                "country_en": "Egypt",
                "color": "true"
            },
            {
                "country_id": "39",
                "country_name": "\u9ece\u5df4\u5ae9",
                "country_en": "Lebanon",
                "color": "true"
            },
            {
                "country_id": "42",
                "country_name": "\u963f\u5c14\u53ca\u5229\u4e9a",
                "country_en": "Algeria",
                "color": "true"
            },
            {
                "country_id": "45",
                "country_name": "\u4ee5\u8272\u5217",
                "country_en": "Israel",
                "color": "true"
            },
            {
                "country_id": "49",
                "country_name": "\u6469\u6d1b\u54e5",
                "country_en": "Morocco",
                "color": "true"
            },
            {
                "country_id": "69",
                "country_name": "\u963f\u5bcc\u6c57",
                "country_en": "Afghanistan",
                "color": "true"
            },
            {
                "country_id": "71",
                "country_name": "\u963f\u66fc",
                "country_en": "Oman",
                "color": "true"
            },
            {
                "country_id": "84",
                "country_name": "\u5df4\u52d2\u65af\u5766",
                "country_en": "Palestine",
                "color": "true"
            },
            {
                "country_id": "85",
                "country_name": "\u5df4\u6797",
                "country_en": "Bahrain",
                "color": "true"
            },
            {
                "country_id": "144",
                "country_name": "\u5361\u5854\u5c14",
                "country_en": "Qatar",
                "color": "true"
            },
            {
                "country_id": "148",
                "country_name": "\u79d1\u5a01\u7279",
                "country_en": "Kuwait",
                "color": "true"
            },
            {
                "country_id": "156",
                "country_name": "\u5229\u6bd4\u4e9a",
                "country_en": "Libya",
                "color": "true"
            },
            {
                "country_id": "224",
                "country_name": "\u585e\u6d66\u8def\u65af",
                "country_en": "Cyprus",
                "color": "true"
            },
            {
                "country_id": "226",
                "country_name": "\u6c99\u7279\u963f\u62c9\u4f2f",
                "country_en": "Saudi Arabia",
                "color": "true"
            },
            {
                "country_id": "243",
                "country_name": "\u7a81\u5c3c\u65af",
                "country_en": "Tunisia",
                "color": "true"
            },
            {
                "country_id": "253",
                "country_name": "\u53d9\u5229\u4e9a",
                "country_en": "Syria",
                "color": "true"
            },
            {
                "country_id": "256",
                "country_name": "\u4e5f\u95e8",
                "country_en": "Yemen",
                "color": "true"
            },
            {
                "country_id": "257",
                "country_name": "\u4f0a\u62c9\u514b",
                "country_en": "Iraq",
                "color": "true"
            },
            {
                "country_id": "264",
                "country_name": "\u7ea6\u65e6",
                "country_en": "Jordan",
                "color": "true"
            }
        ]
    }
]; //全部国家
