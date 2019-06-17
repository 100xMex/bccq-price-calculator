const {
  parseDecimal,
  parsePercent,
  triggerLong,
  triggerShort,
  closeLong,
  closeShort,
} = require('../lib/calculator');

const openPrice = '6.320'; // 开仓价格
const leverage = 20; // 杠杆率
const fee = 0.0003; // 手续费率
const decimal = 0.001; // 精度

// // # 计算收益率, 平仓价格
// const closePrice = '6.450';
// const ratio = 0.1;

// // 收益率
// const { longRatio, shortRatio } = calcRatio(openPrice, closePrice, fee, leverage);
// // 平仓价
// const { upperPrice, lowerPrice } = calcPrice(openPrice, ratio, fee, leverage);
// console.log('做多收益率 %s%, 做空收益率 %s%', parsePercent(longRatio, decimal), parsePercent(shortRatio, decimal));
// console.log('上轨平仓价 %s, 下轨平仓价 %s', parseDecimal(upperPrice, decimal), parseDecimal(lowerPrice, decimal));

// # 计算止盈止损价格, 平仓价格

const winRatio = 0.1; // 止盈收益率
const loseRatio = 0.03; // 止损收益率
const slippage = 0.0005; // 平仓价格滑点

let triggerWin; // 止盈触发价格
let triggerLose; // 止损触发价格
let closeWin; // 止盈下单价格
let closeLose; // 止损下单价格

// 做多 Long
({ triggerWin, triggerLose } = triggerLong(openPrice, winRatio, loseRatio, fee, leverage));
({ closeWin, closeLose } = closeLong(triggerWin, triggerLose, slippage));
console.log(
  '%s做多 => %s 触发止盈 %s 收益率 %s%, %s 触发止损 %s 收益率 %s%',
  parseDecimal(openPrice, decimal),
  parseDecimal(triggerWin, decimal),
  parseDecimal(closeWin, decimal),
  parsePercent(winRatio, decimal),
  parseDecimal(triggerLose, decimal),
  parseDecimal(closeLose, decimal),
  parsePercent(-loseRatio, decimal),
);

// 做空 Short
({ triggerWin, triggerLose } = triggerShort(openPrice, winRatio, loseRatio, fee, leverage));
({ closeWin, closeLose } = closeShort(triggerWin, triggerLose, slippage));
console.log(
  '%s做空 => %s 触发止盈 %s 收益率 %s%, %s 触发止损 %s 收益率 %s%',
  parseDecimal(openPrice, decimal),
  parseDecimal(triggerWin, decimal),
  parseDecimal(closeWin, decimal),
  parsePercent(winRatio, decimal),
  parseDecimal(triggerLose, decimal),
  parseDecimal(closeLose, decimal),
  parsePercent(-loseRatio, decimal),
);
