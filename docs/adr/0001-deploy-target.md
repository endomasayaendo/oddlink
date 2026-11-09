# 0001. デプロイ先（ホスティングと Postgres）

- ステータス: Proposed（オーナーが決定する。本書は推奨まで）
- 日付: 2026-11-10
- 関連: #28（Pool 設定）, #29（起動時の環境変数検証）, #33（レート制限, needs-decision）, #35（データ保持）

## 背景

OddLink は無料で使える短縮 URL サービスで、運営は個人の趣味予算（無料〜月数ドル）。プロダクトとして次が要る。

- **リダイレクトが速いこと。** 利用者は主に日本。短縮 URL を踏んだ人は待たされることを想定していないので、`GET /{shortCode}` の 1 往復（`proxy.ts` → `lib/middleware/link.ts` が UPDATE+INSERT を 1 文で実行）を日本から近い場所で完結させたい。アプリと DB の距離がそのまま毎回の遅延になる。
- **書き込みが毎回発生すること。** クリック数とアクセスログを同じ SQL 文で書くので、キャッシュで DB を避けられない。読み取り専用の CDN キャッシュは効かない。
- **乱用に耐えること。** 公開の短縮 URL は大量発行やスパム誘導に使われやすい。プラットフォーム側でレート制限や遮断ができると、アプリに作り込む量が減る（#33）。
- **定期処理があること。** 期限切れリンクやログの削除（#35）にスケジューラが要る。頻度は 1 日 1 回で足りる見込み。
- **将来の機能。** 任意ログイン（OAuth）を入れる可能性がある。ここでは決めないが、選択肢を潰さない。
- **運用の手間が小さいこと。** 一人で回すので、OS パッチやバックアップを自分で抱える量は少ないほど良い。

## 判断に効く要件

**must**
- M1. 無料枠、または月 $5 前後で現在の規模を運用できる。
- M2. アプリと Postgres を日本（東京）または同じリージョンに置ける。
- M3. 現在の Node.js ランタイムの `proxy.ts` + `pg` をそのまま動かせる（書き直し不要）。
- M4. DB への接続を TLS で、証明書検証付き（`sslmode=verify-full` 相当）で張れる。`rejectUnauthorized: false` は使わない。
- M5. 1 日 1 回以上の定期実行ができる（#35）。

**should**
- S1. プラットフォーム側にレート制限・WAF がある（#33）。
- S2. 10 倍のトラフィックでも料金が読める（急な課金がない）。
- S3. 別の選択肢へ移るときの書き換えが小さい。
- S4. OAuth を足しやすい。

## 選択肢

出典はすべて 2026-11-10 に確認。番号は末尾の「出典」を参照。

### A. Vercel Hobby（関数リージョン `hnd1` 東京）+ Supabase Free（Tokyo `ap-northeast-1`）

確認済みの事実
- Vercel Hobby の目安: Function Invocations 100 万/月、Fast Data Transfer 100 GB、Active CPU 4 時間 [1]。Hobby は**非商用の個人利用のみ**（広告掲載や有償受託は商用扱い、寄付の募集は対象外）[1]。
- 関数リージョンは Hobby でも 1 つ選べ、`hnd1`（東京）がある。既定は `iad1` なので設定必須 [2][3]。
- Vercel のルーティングミドルウェアは Node.js ランタイムが既定で、fluid compute 上で動く [4]。ただし「ルーティングミドルウェアはリージョン設定に関係なく全リージョンにデプロイされ、Hobby では少ないリージョンで動く」とある [2]。Next.js の `proxy.ts` がどのリージョンで実行されるかは**未確認**（後述）。
- Cron は Hobby で 1 日 1 回まで、実行時刻は ±59 分 [5]。
- WAF レート制限は Hobby でも 1 ルール使える [6]。
- `pg` の Pool には `attachDatabasePool`（`@vercel/functions`）で関数停止前にアイドル接続を閉じられる。推奨はグローバルスコープの Pool、短いアイドルタイムアウト、`max: 1` は避ける [7][8]。
- Supabase Free: DB 500 MB/プロジェクト、egress 5 GB、アクティブ 2 プロジェクト、**1 週間操作がないと一時停止**。Pro は $25/月〜 [9]。Tokyo リージョンあり [10]。
- Supabase の共有プーラー（Supavisor）はトランザクションモードが 6543、セッションモードが 5432、どちらも IPv4。トランザクションモードは serverless 向けで、プリペアドステートメント不可、`SET` などセッション状態はトランザクションをまたいで失われる。直接接続は既定で IPv6 [11]。
- TLS は `sslmode=verify-full` 推奨、CA 証明書はダッシュボードから取得 [12]。

できること: Git push でプレビュー・本番デプロイ、東京で app と DB を揃える、WAF・日次 Cron・`after()` がそろう。Supabase Auth も選べる（S4）。
できなくなること: 商用化（広告など）したら Vercel Pro が必要。Hobby の Cron は日次まで。
コスト: 現在 $0。10 倍時は「1 リダイレクト ≒ 1 invocation」と仮定すると月 100 万回（1 日約 3.3 万回）が Hobby の目安の上限。超えたら Vercel Pro（料金は今回未確認）。DB はログの増え方次第で 500 MB に当たり、#35 の保持期間が効く。超えれば Supabase Pro $25/月。

このリポジトリで必要な変更
- Vercel プロジェクトの Root Directory を `apps/web`、Function Region を `hnd1`（`apps/web/vercel.json` の `regions` かダッシュボード）。
- `apps/web/lib/db/index.ts`: `max` を小さく、`idleTimeoutMillis` を短く、`attachDatabasePool(pool)` を追加。
- `statement_timeout`（#28）: トランザクションモードの Supavisor が起動パラメータを受け付けるかは**未確認**。受け付けない場合に備え、ロール単位の `ALTER ROLE ... SET statement_timeout` に移す（DB 側の設定なのでプーラーに依存しない）案を第一候補にする。
- TLS: Supabase の CA を環境変数（例 `DATABASE_CA_CERT`）で渡し `ssl: { ca }` で検証する。接続文字列の `sslmode` と `ssl` オプションの優先関係は実装時に確認する。
- `apps/web/lib/env.ts`: 新しい環境変数の検証。プレビューデプロイも `NODE_ENV=production` になる想定なので、プレビュー用の `BASE_URL` / `DATABASE_URL` を用意するか、別の扱いにする。

ロックイン: 小さい。アプリは素の Next.js で、Vercel 固有なのは `vercel.json` と `attachDatabasePool` だけ。DB は素の Postgres なので `pg_dump` で移せる。

### B. Vercel Hobby + Neon Free

- Neon のリージョンに**東京はない**。アジアは Singapore（`aws-ap-southeast-1`）と Sydney のみ [13]。
- Free: 1 GB、100 CU 時間/月、**5 分無操作でスケールゼロ（無効化不可）** [14]。
- 関数を `sin1` に置けば app↔DB は近いが、日本の利用者↔関数が遠くなる。`hnd1` に置けば毎クエリが東京↔シンガポールを往復する。どちらでも A より遅い（具体的な ms は**未確認**）。スケールゼロ明けの初回遅延もリダイレクトに直に乗る（秒数は**未確認**）。
- コスト: 現在 $0。従量の Launch プランは $0.106/CU 時間 + $0.35/GB 月 [14]。
- 変更点は A とほぼ同じ（プーラー経由なら `statement_timeout` の扱いも同じ問題）。
- ロックイン: 小さい。M2 を満たさないので次点にもしない。

### C. Cloudflare Workers（OpenNext）+ Postgres（Hyperdrive 経由）

- OpenNext の Cloudflare アダプタは Next.js 16 に対応するが、**Node Middleware は未対応** [15]。現在の `proxy.ts` は Node.js ランタイムで `pg` を直接使うので、そのままでは動かない。
- Workers Free: 10 万リクエスト/日、CPU 10 ms/呼び出し。Paid は月 $5〜。Hyperdrive Free: 10 万クエリ/日 [16]。
- できること: CDN の目の前で処理でき、Cloudflare の WAF も使える。
- できなくなること: M3。リダイレクトを Node.js 以外の経路（Edge ランタイムか、ルートハンドラへの移設）に書き直す必要があり、#28/#29 で固めた起動時検証や Pool の前提も作り直しになる。
- コスト: 無料枠は 1 日単位なので、10 倍時はリダイレクトとログ書き込みで日次上限に当たりやすく、Paid $5/月が前提になる見込み。
- ロックイン: 中。アダプタの対応状況に追従し続ける必要がある。

### D. 常時起動の小さな VM／コンテナ（東京）+ Postgres

候補の例:
- Fly.io: 新規組織に無料枠なし（7 日 / $1 の試用クレジットのみ）。shared-cpu-1x 256 MB が $2.19/月（米国リージョンの価格、東京 `nrt` の価格は**未確認**）。Managed Postgres は $38/月〜 [17]。`nrt` は Managed Postgres 対応リージョン [18]。
- Oracle Cloud Always Free: Arm 2 OCPU / 12 GB を無期限で使えるが、ホームリージョン限定で、7 日間 CPU・ネットワークなどの利用率が低いと**回収されうる** [19]。東京をホームリージョンにできるか、空き容量があるかは**未確認**。

できること: 今のコードがほぼそのまま動く（`next start`、Node.js の `proxy.ts`、`max: 10`、`statement_timeout`、`process.exit(1)` → 再起動ポリシーで検知）。`after()` も使える [20]。Cron も OS の機能で自由。
できなくなること: マネージドの WAF・自動 TLS・プレビューデプロイ。レート制限はリバースプロキシかアプリで自前（Next.js もリバースプロキシを前に置くことを推奨 [20]）。OS 更新・バックアップ・監視を自分で持つ。
コスト: Fly + VM 上の自前 Postgres で月 $数ドル。Fly の Managed Postgres を使うと $40/月前後で予算外。DB は A と同じく Supabase Tokyo を使う構成もありうる。10 倍時は VM のサイズを上げるだけで、料金は読みやすい。
このリポジトリで必要な変更: `apps/web/next.config.ts` に `output: "standalone"`、Dockerfile（pnpm + Turborepo の prune）、リバースプロキシ設定、デプロイ用の GitHub Actions ワークフロー。
ロックイン: 最小。ただし運用負荷は最大。

## 提案

**A（Vercel Hobby `hnd1` + Supabase Free Tokyo）を推奨する。**

理由: 4 案のうち、追加費用 $0 のまま M1〜M5 をすべて満たせる見込みがあるのは A だけ。東京で app と DB を揃えられ（M2）、Node.js の `proxy.ts` と `pg` を書き直さずに動かせ（M3）、WAF レート制限（S1）と日次 Cron（M5）がプラットフォームにある。コード変更は `lib/db/index.ts` と設定ファイル程度で済み、素の Next.js + 素の Postgres なので D へ移るのも簡単（S3）。

主なトレードオフ: (1) Vercel Hobby は**非商用限定**。広告などで収益化する時点で Pro が要る。(2) Supabase Free は**1 週間無操作で停止**する。公開中のサービスなら実トラフィックで止まらない想定だが、外部から定期的に叩いて止めない運用が規約上許されるかは**未確認**なので、それを前提にはしない。(3) `proxy.ts` の実行リージョンが未確認（下記）。

**次点は D（東京の常時起動 VM、DB は Supabase Tokyo か VM 上）。** 次のどれかになったら乗り換える。
- 商用化して Vercel Pro の費用を払うより VM の方が安くなるとき。
- Hobby の目安（invocation や Active CPU）や Supabase Free の容量を恒常的に超えるとき。
- `proxy.ts` が東京以外で実行され、リダイレクトの遅延が実測で許容できないとき。
- 日次より細かい定期処理が必要になったとき。

## 影響

- **#28 Pool**: serverless 向けに `max` を小さく・アイドルタイムアウトを短く・`attachDatabasePool` を追加。`statement_timeout` はプーラー依存を避けてロール単位の設定へ移す案を検証する。TLS は CA を渡して証明書検証する。
- **#29 起動時検証**: Vercel 上で `register()` から `process.exit(1)` した場合の挙動（インスタンスが落ちて 500 になるのか、デプロイ失敗として見えるのか）は**未確認**。serverless では「デプロイが目に見えて失敗する」という #29 の狙いが成り立たない可能性があるので、プレビューで確かめる。必要なら、デプロイ前に環境変数を検証するステップを足す。
- **#33 レート制限**: Vercel WAF（Hobby は 1 ルール）を第一候補にできる。具体的な閾値やルールはこのリポジトリには書かず、ダッシュボード側で管理する。
- **#35 データ保持**: Vercel Cron（日次）で削除処理のルートを叩く形が自然。Cron 用ルートには認証が要る。
- **CI**: GitHub Actions の `check` はそのまま維持。デプロイは Vercel の Git 連携に任せ、`main` への push で本番、PR でプレビュー。Vercel 側でもビルドが走るので、ビルドに DB を必要としない現在の方針（CI で `DATABASE_URL` なし）を崩さない。
- **環境変数**: Vercel に `DATABASE_URL`（Supavisor のトランザクションモード URL）、`BASE_URL`、`APP_TIME_ZONE`、CA 証明書用の変数を設定。プレビュー環境の扱いを決める。README の環境変数表とデプロイ手順を更新する。

作るべき follow-up issue（本 ADR が Accepted になってから起票）
1. Vercel + Supabase へのデプロイ設定（Root Directory、`hnd1`、環境変数、README のデプロイ手順）。
2. `lib/db/index.ts` を serverless 向けに調整（`max`・アイドルタイムアウト・`attachDatabasePool`・`statement_timeout` の移設）。
3. DB 接続の TLS 証明書検証（CA の受け渡しと `env.ts` の検証）。
4. Vercel 上での `process.exit(1)` の挙動確認と、必要なら #29 の方針見直し。
5. プレビューデプロイ用の DB と `BASE_URL` の方針。
6. `proxy.ts` の実行リージョンとリダイレクト遅延の実測。
7. #35 の実装方式を Vercel Cron 前提で具体化。

## 未確認事項・リスク

- Next.js の `proxy.ts` が Vercel 上で関数リージョン（`hnd1`）で動くのか、ルーティングミドルウェアとして複数リージョンで動くのか。後者なら DB との距離が利用者の場所に左右され、リージョンごとに Pool ができて接続数も増える。
- Supavisor トランザクションモードが `statement_timeout` を起動パラメータとして受け付けるか。ロール単位の設定が Supavisor 経由の接続に効くか。
- Vercel 上での `register()` 内の `process.exit(1)` の挙動。
- Vercel Pro の料金と、Hobby の目安を超えたときの扱い（停止か通知か）。
- Supabase Free の停止を外部からの定期アクセスで防ぐことの可否。
- 各構成での実際のレイテンシ（app↔DB、利用者↔関数）。調査メモにあった「東京内なら 5 ms 未満」などの数値は出典がなく採用しない。
- Fly.io 東京の料金、Oracle Cloud で東京をホームリージョンにできるか。
- 料金・制限は変わる。採用時に出典を再確認する。

## 出典（すべて 2026-11-10 確認）

1. Vercel Fair Use Guidelines — https://vercel.com/docs/limits/fair-use-guidelines
2. Vercel Configuring regions for Functions — https://vercel.com/docs/functions/configuring-functions/region
3. Vercel Global network and regions — https://vercel.com/docs/regions
4. Vercel Routing Middleware — https://vercel.com/docs/routing-middleware
5. Vercel Cron Jobs usage & pricing — https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing
6. Vercel WAF Rate Limiting — https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
7. Vercel `@vercel/functions` API reference — https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
8. Vercel KB: Connection pooling with Functions — https://vercel.com/kb/guide/connection-pooling-with-functions
9. Supabase Pricing — https://supabase.com/pricing
10. Supabase Regions — https://supabase.com/docs/guides/platform/regions
11. Supabase Connecting to Postgres — https://supabase.com/docs/guides/database/connecting-to-postgres
12. Supabase SSL enforcement — https://supabase.com/docs/guides/platform/ssl-enforcement
13. Neon Regions — https://neon.com/docs/introduction/regions
14. Neon Pricing — https://neon.com/pricing
15. OpenNext Cloudflare — https://opennext.js.org/cloudflare
16. Cloudflare Workers pricing — https://developers.cloudflare.com/workers/platform/pricing/
17. Fly.io Pricing — https://docs.fly.io/about/pricing
18. Fly.io Regions — https://docs.fly.io/reference/regions/
19. Oracle Cloud Always Free resources — https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
20. Next.js Self-Hosting guide — https://nextjs.org/docs/app/guides/self-hosting
