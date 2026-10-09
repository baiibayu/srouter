[English](../../en/providers/04-recurring-credit-gateways.md) · **简体中文**

# ElectronHub

ElectronHub 使用 Bearer 鉴权，通过其 `/v1` 基础 URL 下的 Chat Completions 接口提供服务。可用模型由经过签名的 Oracle 目录管理，不通过应用迁移预置。现有目录政策保持不变：Premium 用户可立即访问，Free 用户在 30 天后可访问。

| 提供方 ID | 基础 URL | 密钥校验端点 | 免费计划额度 |
| --- | --- | --- | --- |
| `electronhub` | `https://api.electronhub.ai/v1` | `GET /v1/user/me` | 每周共享 $0.25 额度，并非每月；仅适用于非 Premium、按额度扣费的路由 |

2026-09-06 的核验结果：23 个 ElectronHub 模型 ID 返回了有效文本。账户 API 显示订阅为 Free，消费从每周额度中扣除，且没有购买的额度余额。ElectronHub 有使用限额，也不是按模型分别发放额度。

ElectronHub 的模型列表公开可访问，因此密钥校验使用需要鉴权的账户端点。其专用兼容子类会识别并拒绝 HTTP 200 响应中观察到的代理错误提示，包括提示跨越多个 SSE 数据块的情况。另外 7 个经过测试的 ElectronHub 候选模型未加入目录。

密钥导入接受 `ELECTRONHUB_API_KEY` 和 `ELECTRON_HUB_API_KEY`。

适配器不会更改提供方的计费设置。它依据共享额度池和提供方响应头处理额度，不会自行假定每个模型有独立的积分或词元额度。启用付费充值或自带提供方密钥的路由前，请先在提供方处设置支出控制。

来源：[ElectronHub 额度](https://docs.electronhub.ai/billing/credits)、[模型访问](https://docs.electronhub.ai/billing/model-access)、[账户 API](https://docs.electronhub.ai/api-reference/usage)。
