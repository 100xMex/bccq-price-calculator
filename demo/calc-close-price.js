// 合约开平仓计算器 => 根据目标利润率计算平仓价

const open = 6.320; // 开仓价
const leverage = 20.0; // 杠杆倍数
const percent = 0.1; // 目标利润率&亏损率
const fee = 0.0003; // 手续费率

const decimal = 100000;

// 利润率+杠杆倍数 折算涨跌幅
const lp = percent / leverage;

// 涨跌幅计算平仓价
const prices = [
  parseInt(open * (1 - (lp + fee)) * decimal) / decimal,
  parseInt(open * (1 + (lp + fee)) * decimal) / decimal,
];

// 平仓价
console.log('做空 %s 做多 %s', prices[0], prices[1]);
