// # 下单工具
//
// 现在的期货市场都是只有限价单和止盈止损单, 需要玩家手动一笔笔计算.
//
// 那么我们的需求就是, 通过计算器与限价单和止盈止损单的配合, 一次下单就包括开仓, 止盈单, 止损单.
//
// ## 计算器

// 转换为固定精度数值
const parseDecimal = (v, decimal) => parseInt(v / decimal, 10) * decimal;
// 转换为固定精度百分比
const parsePercent = (v, decimal) => parseInt(v / decimal * 100, 10) * decimal;

// 1. 收益率计算器 Ratio PNL:
//
// 已知:
// Long / Short 做的/做空
// Leverage 杠杆倍数
// Open Price 开仓价
// Close Price 平仓价
// Fee 交易手续费
//
// 未知:
// PNL Ratio(%) 收益率

// 价格收益率 Price Ratio:
//   做多: ((closePrice × (1 - fee)) /(openPrice × (1 + fee)) - 1)
//   做空: ((1 - (closePrice × (1 + fee)) /(openPrice × (1 - fee))))
// 收益率 PNL Ratio: priceRatio * leverage

const calcRatio = (openPrice, closePrice, fee, leverage) => {
  const longRatio = leverage * ((closePrice * (1 - fee)) / (openPrice * (1 + fee)) - 1);
  const shortRatio = leverage * ((1 - (closePrice * (1 + fee)) / (openPrice * (1 - fee))));
  // console.log('做多盈利率 %s%, 做空亏损率 %s%', longRatio * 100, shortRatio * 100);

  return { longRatio, shortRatio };
};

// 2. 平仓价计算器 Close Price:

// 已知:
// Long / Short 做的/做空
// Leverage 杠杆倍数
// Open Price 开仓价
// PNL Ratio(%) 收益率
// Fee 交易手续费
//
// 未知:
// Close Price 平仓价 - 止盈止损价格

const calcPrice = (openPrice, ratio, fee, leverage) => {
  const upperPrice = (ratio / leverage + 1) * (openPrice * (1 + fee)) / (1 - fee);
  const lowerPrice = (1 - ratio / leverage) * (openPrice * (1 - fee)) / (1 + fee);
  // console.log('做多止盈/做空止损价格 %s, 做空止盈/做多止损价格 %s', upperPrice, lowerPrice);

  return { upperPrice, lowerPrice };
};

// 3. 清算价计算器 Liquidation Price:

// TODO
const calcLiquidation = () => { };

// 4. 止盈止损触发价格计算器 Trigger Price:

// 已知:
// Long / Short 做的/做空
// Leverage 杠杆倍数
// Open Price 开仓价
// Win Ratio(%) 止盈收益率
// Lose Ratio(%) 止损收益率
// Fee 交易手续费
//
// 未知:
// Upper Price 上轨价格: 做多时为止盈价格, 做空时为止损价格
// Lower Price 下轨价格: 做多时为止损价格, 做空时为止盈价格

const triggerLong = (openPrice, winRatio, loseRatio, fee, leverage) => {
  // console.log('开仓价格 %s', openPrice);
  const { upperPrice } = calcPrice(openPrice, winRatio, fee, leverage);
  const { lowerPrice } = calcPrice(openPrice, loseRatio, fee, leverage);
  // console.log('Close Long: 止盈价格 %s, 止损价格 %s', upperPrice, lowerPrice);

  return { triggerWin: upperPrice, triggerLose: lowerPrice };
};

const triggerShort = (openPrice, winRatio, loseRatio, fee, leverage) => {
  // console.log('开仓价格 %s', openPrice);
  const { lowerPrice } = calcPrice(openPrice, winRatio, fee, leverage);
  const { upperPrice } = calcPrice(openPrice, loseRatio, fee, leverage);
  // console.log('Close Short: 止盈价格 %s, 止损价格 %s', lowerPrice, upperPrice);

  return { triggerWin: lowerPrice, triggerLose: upperPrice };
};

// 5. 止盈止损下单价格计算器 Close Price:

// 已知
// Trigger Win Price 止盈触发价格
// Trigger Lose Price 止损触发价格
//
// 未知:
// Close Win Price 止盈价格
// Close Lose Price 止损价格

const closeLong = (closeTriggerWin, closeTriggerLose, slippage) => {
  if (!slippage) {
    const closeWin = closeTriggerWin * (1 - closeTriggerLose);
    return closeWin;
  }

  const closeWin = closeTriggerWin * (1 - slippage);
  const closeLose = closeTriggerLose * (1 - slippage);
  return { closeWin, closeLose };
};

const closeShort = (closeTriggerWin, closeTriggerLose, slippage) => {
  if (!slippage) {
    const closeWin = closeTriggerWin * (1 + slippage);
    return closeWin;
  }

  const closeWin = closeTriggerWin * (1 + slippage);
  const closeLose = closeTriggerLose * (1 + slippage);
  return { closeWin, closeLose };
};

module.exports = {
  calcRatio,
  calcPrice,
  parseDecimal,
  parsePercent,
  calcLiquidation,
  triggerLong,
  triggerShort,
  closeLong,
  closeShort,
};
