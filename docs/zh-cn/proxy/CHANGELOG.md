[English](../../en/proxy/CHANGELOG.md) Â· **ç®€ä½“ä¸­æ–‡**

# ä»£ç†åŸŸ â€”â€” å˜æ›´æ—¥å¿—

`docs/proxy/` çš„æ–‡æ¡£ä¿®è®¢åŽ†å²ï¼Œå–è‡ªè§¦åŠå‡ºç«™ä»£ç†ä¸Ž Fetch Relay çš„æäº¤ã€‚æœ€è¿‘çš„åœ¨å‰ã€‚

| æäº¤ | æ—¥æœŸ | æ‘˜è¦ |
| --- | --- | --- |
| `992bb833` | 2026-09-02 | feat(proxy): ä¸ºåå‘ä»£ç†åŽçš„å®¢æˆ·ç«¯ IP é€‚é… `TRUST_PROXY` (#1041) â€”â€” æ–°å¢ž `TRUST_PROXY`ï¼ˆ`false\|true\|<hops>\|addr/CIDR`ï¼Œ`.env.example:306-315`ï¼Œ`server/src/lib/config.ts:95-112` çš„ `parseTrustProxy`ï¼‰å¹¶è½¬å‘ç»™ Express `trust proxy`ï¼Œä½¿åˆ†æžä¸Ž `PROXY_RATE_LIMIT_RPM`/`ADMIN_RATE_LIMIT_RPM` åœ¨ Caddy/nginx/Traefik ä¹‹åŽèƒ½çœ‹åˆ°çœŸå®žå®¢æˆ·ç«¯ IPï¼›é»˜è®¤ `false`ï¼ˆä¸ä¿¡ä»»ä¼ªé€ ï¼‰ã€‚ |
| `ef2471b9` | 2026-09-01 | feat(proxy): ä½œä¸ºæœ€åŽå…œåº•è‡ªåŠ¨æ£€æµ‹ç³»ç»Ÿçº§ä»£ç†è®¾ç½® (#838) â€”â€” æ–°å¢ž `detectSystemProxy()`ï¼ˆ`server/src/lib/proxy.ts:52-414` â€”â€” macOS ä¸Š `scutil --proxy`ï¼ŒWindows æ³¨å†Œè¡¨ `ProxyEnable`+`ProxyServer`ï¼ŒLinux ä¸Š GNOME `gsettings` `manual` + `http host/port`ï¼‰ä½äºŽ `PROXY_URL â†’ ä»ªè¡¨ç›˜ â†’ ALL_PROXY â†’ HTTPS_PROXY â†’ HTTP_PROXY â†’ detectSystemProxy() â†’ ç›´è¿ž` é“¾æœ«å°¾ï¼ˆ`resolveProxySource`ï¼‰ï¼Œå…³é—­ #353/#1069ï¼Œå°½åŠ›è€Œä¸ºï¼Œ2 ç§’è¶…æ—¶ï¼Œæ°¸ä¸æŠ›å¼‚å¸¸ã€‚ |
| `7d430f46` | 2026-08-31 | æŒ‰éœ€å¯ç”¨çš„ Fetch Relay å‡ºç«™ä¼ è¾“ (#975) â€”â€” æ–°å¢ž `PROXY_MODE`ï¼ˆ`forward` é»˜è®¤ï¼Œ`fetch-relay` æŒ‰éœ€å¯ç”¨ï¼Œ`.env.example:74-78`ï¼Œ`server/src/lib/proxy.ts:52` çš„ `PROXY_MODES`ï¼‰ä¸Ž `FETCH_RELAY_TOKEN`ï¼ˆbearerï¼Œé™æ€åŠ å¯†ï¼Œç©ºå€¼è¡¨ç¤ºæœªé‰´æƒä½†ä¸æŽ¨èï¼ŒçŽ¯å¢ƒå˜é‡ä¼˜å…ˆäºŽä»ªè¡¨ç›˜ï¼Œ`.env.example:78`ï¼Œ`server/src/lib/proxy.ts:389-417`ï¼Œ`isLoopbackRelayHostname`/`fetchRelayUrlError` å›žçŽ¯-https é˜²æŠ¤ï¼Œ`Fetch-Relay-Target`/`Fetch-Relay-Authorization` å¤´ï¼Œ`fetchRelayFetch` æµå¼ + æ‰‹åŠ¨é‡å®šå‘ï¼Œ`examples/fetch-relay-worker/` Cloudflare Worker å‚è€ƒï¼‰ï¼›åˆå§‹ `docs/fetch-relay.md`ï¼ˆçŽ°ä¸º `docs/en/proxy/01-fetch-relay.md`ï¼‰åŒ…å«åè®®ã€å®‰å…¨å¥‘çº¦ä¸Ž Worker è¯¦æƒ…ã€‚ |
| `386f43e9` | 2026-08-22 | docs(env): æ–°å¢žè¿è¡Œæ—¶é…ç½®å‚è€ƒåŸŸ â€”â€” åœ¨ `docs/en/env/03-outbound-proxies.md` ä¸­é¦–æ¬¡åŠ å…¥å‡ºç«™ä»£ç†æ–‡æ¡£ï¼ˆä¼˜å…ˆçº§ `PROXY_URL â†’ ä»ªè¡¨ç›˜ â†’ ALL_PROXY â†’ HTTPS_PROXY â†’ HTTP_PROXY`ï¼Œåè®®æ”¯æŒ `http`/`https`/`socks4`/`socks4a`/`socks5`/`socks5h`ï¼Œ`NO_PROXY` ç»•è¿‡ï¼ŒDocker `host.docker.internal` å‘ç‚¹ï¼Œå…¥ç«™é™æµæ—‹é’®ï¼‰ï¼Œæ­å»º `docs/env/` åŸŸè„šæ‰‹æž¶ï¼Œå« `OVERVIEW.md` + `CHANGELOG.md`ã€‚ï¼ˆç» #979 åˆå…¥ï¼‰ |

ä½¿ç”¨ `git log --oneline -- docs/proxy/ docs/fetch-relay.md docs/env/03-outbound-proxies.md` ä¸Ž `git log --oneline --grep=proxy --grep=relay --grep=TRUST_PROXY` é‡æ–°ç”Ÿæˆã€‚
