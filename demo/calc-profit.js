// 合约开平仓计算器 => 根据目标利润率计算平仓价

const open = 6.320; // 开仓价
const close = 6.450; // 平仓价
const leverage = 20.0; // 杠杆倍数
const fee = 0.0003; // 手续费率

const decimal = 100000;

const percents = [
  ((1 - fee) - close / open) * leverage,
  (close / open - (1 + fee)) * leverage
];

console.log('做多 %s% 做空 %s%',
  parseInt(percents[1] * decimal * 100, 10) / decimal,
  parseInt(percents[0] * decimal * 100, 10) / decimal,
);