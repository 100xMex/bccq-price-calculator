const {
  calcRatio,
  calcPrice,
  parseDecimal,
  parsePercent,
  // calcLiquidation,
  triggerLong,
  triggerShort,
  closeLong,
  closeShort,
} = require('./lib/calculator');

const FixedTriggerPrice = require('./lib/trigger_price_fixed');

const MovingTriggerPrice = require('./lib/trigger_price_moving');

module.exports = {
  calcRatio,
  calcPrice,
  parseDecimal,
  parsePercent,
  triggerLong,
  triggerShort,
  closeLong,
  closeShort,
  FixedTriggerPrice,
  MovingTriggerPrice,
};
