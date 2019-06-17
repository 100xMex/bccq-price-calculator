// 开仓的时候设置好止损, 无止盈; 当价格向有利方向变动, 止损价同方向移动; 但是当价格朝不利方向移动, 止损价不动.
// 止损价按照当前价格朝有盈利的单方向移动 - 要有格子概念(保证最小盈利能覆盖手续费)

const { EventEmitter } = require('events');

const {
  calcRatio, calcPrice,
  closeLong, closeShort,
  parseDecimal, parsePercent,
} = require('./calculator');

class MovingTriggerPrice extends EventEmitter {
  constructor(longshort, leverage, fee, radio, slippage, decimal) {
    super();

    this.longshort = longshort; // 多>0, 空<=0
    this.leverage = leverage; // 杠杆倍数
    this.fee = fee; // 手续费率
    this.radio = radio; // 止损百分比
    this.slippage = slippage; // 止损价下单价格与止损价差百分比
    this.decimal = decimal; // 最小精度

    this.holdPrice = 0; // 平均持仓价格
    this.currPrice = 0; // 当前市场价格
    this.holdCont = 0; // 持仓数量

    this.movePrice = 0; // 触发器价格移动触发价
    this.triggerPrice = 0; // 平仓触发价格
    this.closePrice = 0; // 平仓价格

    this.pnlRatio = 0; // 收益率
  }

  // 加仓
  addCont(cont, price) {
    if (cont <= 0) return this.minusCont(-cont, price);

    // 计算原尺寸总成本
    const holdTotal = this.holdPrice * this.holdCont;
    // 新的持仓总成本
    const addTotal = price * cont;

    const total = holdTotal + addTotal; // 持仓总成本
    this.holdCont += cont; // 持仓总张数
    this.holdPrice = total / this.holdCont; // 平均持仓成本

    return this.onPriceChange(price);
  }

  // 减仓
  minusCont(cont, price) {
    if (cont === 0 || this.holdCont < cont) return this;

    // 计算原尺寸总成本
    const holdTotal = this.holdPrice * this.holdCont;
    // 新的持仓总成本
    const minusTotal = price * cont;

    const total = holdTotal - minusTotal; // 持仓总成本
    this.holdCont -= cont; // 持仓总张数
    this.holdPrice = this.holdCont > 0 ? total / this.holdCont : 0; // 平均持仓成本

    return this;
  }

  calcProfitRatio() {
    // 未实现收益率
    const { longRatio, shortRatio } = calcRatio(
      this.holdPrice,
      this.currPrice,
      this.fee,
      this.leverage,
    );

    this.pnlRatio = this.longshort > 0
      ? parsePercent(longRatio, this.decimal)
      : parsePercent(shortRatio, this.decimal);
    console.log(
      '当前价格 %s 持仓价格 %s 平仓价格 %s=>%s 移仓价格 %s 仓位 %s, 未实现收益率 %s%',
      this.currPrice, this.holdPrice, this.triggerPrice, this.closePrice, this.movePrice, this.holdCont, this.pnlRatio,
    );
  }

  // 价格变化
  onPriceChange(price) {
    // 无仓位
    if (this.holdCont <= 0) return this;

    this.currPrice = price;

    // 平仓价
    const { upperPrice, lowerPrice } = calcPrice(
      this.currPrice,
      this.radio,
      this.fee,
      this.leverage,
    );
    // console.log(
    //   '上轨平仓价 %s, 下轨平仓价 %s',
    //   parseDecimal(upperPrice, this.decimal),
    //   parseDecimal(lowerPrice, this.decimal),
    // );

    if (this.longshort > 0) {
      // 做多时: 价格未初始化, 当止损低于原来止损线 并且 当前价格已经超过移动线
      if ((this.triggerPrice === 0 || this.movePrice === 0)
        || (this.triggerPrice < lowerPrice && this.currPrice > this.movePrice)
      ) {
        this.triggerPrice = parseDecimal(lowerPrice, this.decimal);
        this.closePrice = closeLong(this.triggerPrice, this.slippage);
        this.movePrice = parseDecimal(upperPrice, this.decimal);
        console.log(
          '平多价 %s=>%s, 移动平多价 %s',
          parseDecimal(this.triggerPrice, this.decimal),
          parseDecimal(this.closePrice, this.decimal),
          parseDecimal(this.movePrice, this.decimal),
        );
      }
    }
    if (this.longshort <= 0) {
      // 做空时: 价格未初始化, 当止损高于原来止损线 并且 当前价已经低于移动线
      if ((this.triggerPrice === 0 || this.movePrice === 0)
        || (this.triggerPrice > upperPrice && this.currPrice < this.movePrice)
      ) {
        this.triggerPrice = parseDecimal(upperPrice, this.decimal);
        this.movePrice = parseDecimal(lowerPrice, this.decimal);
        this.closePrice = closeShort(this.triggerPrice, this.slippage);
        console.log(
          '平空价 %s=>%s, 移动平空价 %s',
          parseDecimal(this.triggerPrice, this.decimal),
          parseDecimal(this.closePrice, this.decimal),
          parseDecimal(this.movePrice, this.decimal),
        );
      }
    }

    if (this.longshort > 0 && this.currPrice <= this.triggerPrice) {
      this.closeLong();
      return this;
    }
    if (this.longshort <= 0 && this.currPrice >= this.triggerPrice) {
      this.closeShort();
      return this;
    }

    return this;
  }

  closeLong() {
    console.log(
      '做多 触发平仓 持仓价 %s, 当前价 %s, 平仓价 %s 收益率 %s%',
      parseDecimal(this.holdPrice, this.decimal),
      parseDecimal(this.currPrice, this.decimal),
      parseDecimal(this.triggerPrice, this.decimal),
      parseDecimal(this.pnlRatio, this.decimal),
    );

    this.minusCont(this.holdCont, this.holdPrice);
    this.emit('onCloseLong');
  }

  closeShort() {
    console.log(
      '做空 触发平仓 持仓价 %s, 当前价 %s, 平仓价 %s 收益率 %s%',
      parseDecimal(this.holdPrice, this.decimal),
      parseDecimal(this.currPrice, this.decimal),
      parseDecimal(this.triggerPrice, this.decimal),
      parseDecimal(this.pnlRatio, this.decimal),
    );

    this.minusCont(this.holdCont, this.holdPrice);
    this.emit('onCloseShort');
  }
}

module.exports = MovingTriggerPrice;
