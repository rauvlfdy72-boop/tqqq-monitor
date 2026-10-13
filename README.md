# TQQQ 每日监控

独立的静态监控网站。行情由 GitHub Actions 从 FRED 取得，信号由普通 JavaScript 计算，GitHub Pages 负责展示。运行和查看均不需要 ChatGPT、OpenAI API key、Sites 凭据或券商登录。

## 固定规则

1. 信号指数为纳斯达克 100 价格指数 `NASDAQ100`。
2. 计算包括当日收盘在内的最近 200 个有效交易日简单均线。
3. 严格连续 10 日高于均线的 101%：进入持有状态；严格连续 10 日低于 99%：进入现金状态。其他时候继承上一状态。
4. 每周首个美股交易日收盘执行。持有状态将全部可用现金投入 TQQQ，现金状态卖出全部 TQQQ。仅使用执行日前一个交易日已确认的状态。
5. 新现金到账不直接触发买入，等到下一次执行日。状态每天更新，订单频率仍是周度。

引擎从 1995-01-04、初始现金状态重建，与原研究的初始化方式一致。计算得到的策略目标不是实际账户持仓。网站不提交任何订单。

## 本地运行

Node.js 22 或以上，无第三方依赖，无需安装包。

```sh
npm test
npm run refresh
npm run build
npm run dev
```

打开终端输出的地址。页面每两分钟读取最新已发布数据；“读取最新”按钮也可手动检查。现金和持仓输入只存于当前浏览器，不上传服务器，不会进入仓库。

## GitHub Pages 与每日更新

仓库 Settings → Pages → Source 选择 **GitHub Actions**。将默认分支设为 `main`，推送后运行 `Update and deploy monitor`。也可以在 Actions 页面选择 Run workflow。

工作流计划每日 UTC 12:30（北京时间 20:30）更新、校验、记录数据版本并部署。GitHub 的计划任务可能延迟；页面依据最新已结束的交易日检查行情是否有效，不能把“工作流启动时间”当作行情日期。读取或校验失败时，工作流停止、保留上次发布的数据；旧数据不满足最近收盘覆盖要求时，页面暂停买卖提示。

公开仓库的计划任务受 GitHub 的活动规则约束；实际每日数据更新会留下提交记录。应留意 Actions 是否正常，不能把自动化视为绝对准时或永不失败。

## 日历维护

当前已核验日历截至 **2026-12-31**。跨年或临时停市时，应根据 Nasdaq 官方日历更新 `src/strategy.mjs` 中的休市日、提前收盘日和 `verifiedThrough`，运行测试并推送。没有核验的新年份会暂停操作提示；程序不会擅自把未知工作日当成交易日。

## 代码与数据

- `src/strategy.mjs`：唯一的信号、日历与执行判断引擎，服务器和浏览器共用。
- `src/dataset.mjs`：从完整日线重建信号并产生公开数据集。
- `scripts/refresh.mjs`：无密钥取行情，拒绝倒退、缺口和未结束交易日的收盘。
- `site/`：独立页面、图表、历史记录和账户提示。
- `data/market.json`：上次成功核验的公开行情与规则结果；没有用户资金或持仓。
- `tests/`：确认、滞后执行、节假日、时区和数据错误校验。

行情来源：[FRED / Nasdaq](https://fred.stlouisfed.org/series/NASDAQ100)。交易日历：[Nasdaq 官方日历](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule)。部署与计划运行规则：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[GitHub Actions schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

这是固定历史研究规则的观察工具。其历史回撤曾超过 80%；信号不是未来收益保证。收盘成交是回测假设，实际执行以券商为准。
