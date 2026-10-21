[English](../../en/api/CHANGELOG.md) Â· **ç®€ä½“ä¸­æ–‡**

# API åŸŸ â€”â€” å˜æ›´æ—¥å¿—

`docs/api/` çš„æ–‡æ¡£ä¿®è®¢åŽ†å²ã€‚æœ€è¿‘çš„åœ¨å‰ã€‚

## 2026-10-10

- **docs(api): å¤æ‚åº¦é—¨æŽ§å¯ä»Žå·²å…³è”çš„ provider key è‡ªåŠ¨æ£€æµ‹ä¸»æœº** â€”â€” `GET /api/settings/complexity-gate` çŽ°è¿”å›ž `detectedHosts`ï¼ˆKeys ä¸­æœ‰å…³è” key çš„é¢„è®¾ idï¼ŒæŒ‰ platform æˆ– base URL åŒ¹é…ï¼‰ä¸Ž `jevKeyStored`ï¼ˆä»…è¡¨ç¤ºæ‰‹åŠ¨è¦†ç›–ï¼‰ï¼›å½“å·²æ£€æµ‹ä¸»æœºçš„ provider key å¯ç”¨æ—¶ `hasJevApiKey` ä¸º trueã€‚æ‰“åˆ†å™¨åœ¨è°ƒç”¨æ—¶**ç›´æŽ¥å€Ÿç”¨è¯¥ key** â€”â€” ä¸å‘ settings å¤åˆ¶ä»»ä½•å†…å®¹ï¼Œå“åº”ä¹Ÿä»Žä¸å›žæ˜¾ã€‚æ–°å¢žå·²éªŒè¯ä¸»æœºé¢„è®¾ï¼š**OpenRouter**ï¼ˆ`https://openrouter.ai/api/v1/systemone`ï¼Œæ¨¡åž‹ `typesafe/jev-1.13`ï¼Œ2026-10-10 å®žæµ‹ HTTP 200ï¼‰ã€‚Models â†’ System One çš„ä¸»æœºä¸‹æ‹‰æ˜¾ç¤ºç»¿è‰²"å·²æ£€æµ‹"æ ‡è®°ï¼Œkey è¡Œæ˜¾ç¤º"è‡ªåŠ¨ â€” æ¥è‡ªå·²å…³è”çš„ provider key"çŠ¶æ€æ–‡æœ¬è€Œéžè¾“å…¥æ¡†ã€‚æ¥æºï¼š`server/src/services/complexity-gate.ts`ã€`server/src/routes/settings.ts`ã€`client/src/pages/SystemOnePage.tsx`ã€‚
- **docs(api): ç½‘é¡µæœç´¢å›žé€€é“¾ã€attempts ä¸Žé¢åº¦è®¡æ•°** â€”â€” `POST /v1/web-search` ä¸å†åªå›žé€€ DuckDuckGo ä¸€æ¬¡ï¼šå…ˆè¯•æ‰€é€‰åŽç«¯ï¼Œå†æ²¿å›ºå®šé“¾ç»§ç»­ï¼ˆDuckDuckGo â†’ SearXNG â†’ TinyFish â†’ Exa â†’ Brave â†’ Tavilyï¼›æ— å¯†é’¥/æ— å®žä¾‹ URL çš„å€™é€‰è·³è¿‡ï¼‰ï¼Œå…¨éƒ¨çº¦æŸåœ¨åŒä¸€ä¸ªçº¦ 25 ç§’é¢„ç®—å†…ã€‚å¤šæ¬¡å°è¯•æ‰æˆåŠŸçš„å“åº”å¸¦ `attempts: [{backend, ok, error?}]`ï¼›å…¨éƒ¨å¤±è´¥æ—¶ä»¥ `502` ä¸ŠæŠ¥å¹¶æ‹¼æŽ¥æ¯ä¸ªåŽç«¯çš„é”™è¯¯ã€‚`GET/PUT /api/settings/web-search` æ–°å¢žè¿”å›ž `usage: {daily, monthly}`ï¼ˆæœ¬åœ°å°è¯•è®¡æ•° â€”â€” æä¾›å•†æ²¡æœ‰é¢åº¦æŸ¥è¯¢ APIï¼‰ï¼Œ**æ¨¡åž‹ â†’ Web** æŒ‰åŽç«¯å±•ç¤ºå¹¶å¯¹ç…§å…¬å¸ƒçš„å…è´¹é¢åº¦ã€‚æ¥æºï¼š`server/src/services/web-search.ts`ã€`server/src/routes/tools.ts`ã€`server/src/routes/settings.ts`ã€‚
- **docs(api): Exa ä¸Ž TinyFish åŠ å…¥ç½‘é¡µæœç´¢ï¼›TinyFish åŠ å…¥æŠ“å–é“¾** â€”â€” `POST /v1/web-search` çŽ°è®°å½•å…­ä¸ªåŽç«¯ï¼šDuckDuckGoï¼ˆé»˜è®¤ã€å…å¯†é’¥ï¼‰ã€SearXNGã€Tavilyã€Braveã€**Exa**ï¼ˆå…è´¹é¢åº¦ï¼šæ¯æœˆ $10 ä»£é‡‘ã€å…å¡ï¼‰ä¸Ž **TinyFish**ï¼ˆå…è´¹ï¼šä»»æ„ä½™é¢æ¯å¤© 1.2 ä¸‡æ¬¡æœç´¢ï¼Œä¸€ä¸ªè´¦æˆ·çº§å¯†é’¥ï¼‰ï¼Œå¹¶ä¿æŒè‡ªåŠ¨å›žé€€ DuckDuckGoã€‚`POST /v1/fetch` åœ¨å·²å­˜è¯¥å¯†é’¥æ—¶å…ˆèµ° TinyFish é˜…è¯»å™¨ã€å†èµ° Jinaï¼ˆ`via: direct|tinyfish|jina`ï¼‰ã€‚çŠ¶æ€é¡µé“¾æŽ¥çŽ°æ·±é“¾åˆ° **Keys â†’ Web search**ï¼ˆ`/keys?tab=webSearch`ï¼‰ã€‚æ¥æºï¼š`server/src/services/web-search.ts`ã€`server/src/routes/tools.ts`ã€`server/src/routes/settings.ts`ã€‚

## 2026-10-09

- **docs(api): ç½‘é¡µæœç´¢æ”¹ä¸ºå¤šåŽç«¯** â€”â€” `POST /v1/web-search` çŽ°å·²è®°å½•åŽç«¯é€‰æ‹©å™¨ï¼ˆ**Keys é¡µ â†’ Providers â†’ Web search backend**ï¼›å®žæ—¶çŠ¶æ€è§ **æ¨¡åž‹ â†’ Web Search**ï¼‰ï¼šDuckDuckGoï¼ˆé»˜è®¤ã€å…å¯†é’¥ï¼‰ã€è‡ªæ‰˜ç®¡ SearXNG å®žä¾‹ï¼ˆJSON æ ¼å¼ï¼‰ï¼Œæˆ–æœåŠ¡ç«¯ä¿å­˜å…è´¹é¢åº¦å¯†é’¥çš„ Tavily/Braveï¼›ä»»ä¸€åŽç«¯ä¸å¯è¾¾æ—¶è‡ªåŠ¨å›žé€€åˆ° DuckDuckGoï¼Œ`provider` å¦‚å®žæŠ¥å‘ŠçœŸæ­£ä½œç­”çš„åŽç«¯ï¼ˆéªŒè¯ç /é™æµ â†’ `502` è¡Œä¸ºä¸å˜ï¼‰ã€‚æ¥æºï¼š`server/src/services/web-search.ts`ã€`server/src/routes/settings.ts`ã€‚
- **docs(api): è¡¥å……ç½‘é¡µæœç´¢ä¸Ž URL æŠ“å–å·¥å…·** â€”â€” `01-rest-api.md` æ–°å¢ž `POST /v1/web-search`ï¼ˆå…å¯†é’¥ DuckDuckGo HTML åŽç«¯ï¼Œ`max_results` 1â€“10ï¼Œé™æµ/éªŒè¯ç é¡µä¸ŠæŠ¥ä¸º `502` è€Œéžç©ºç»“æžœé›†ï¼‰ä¸Ž `POST /v1/fetch`ï¼ˆä»…å…¬ç½‘ `http(s)`ï¼Œå«è¿žæŽ¥å‰ DNS è§£æžæ£€æŸ¥çš„é˜² SSRF å®ˆå«ï¼Œ`max_bytes` 1 KiBâ€“2 MiB ç¡¬æˆªæ–­ï¼ŒJina é˜…è¯»å™¨å›žé€€ï¼Œ`via: direct|jina`ï¼‰ã€‚ä¸¤ä¸ªç«¯ç‚¹å‡è¦æ±‚ç»Ÿä¸€æŽ¨ç† keyï¼ˆæ‹’ç»ä»ªè¡¨ç›˜ä¼šè¯ tokenï¼‰ï¼Œå…±äº« `/v1` ä»£ç†é™æµã€‚æ¥æºï¼š`server/src/routes/tools.ts`ã€‚

## 2026-08-23 â€”â€” æ–‡æ¡£é‡ç»„

- **386f43e9** `docs(api): fold API guide into api domain` â€” `docs/api.md` â†’ `docs/api/01-rest-api.md`ï¼Œè¡¥ `OVERVIEW.md` + `CHANGELOG.md` è„šæ‰‹æž¶ã€‚ï¼ˆç» #979 åˆå…¥ï¼‰
