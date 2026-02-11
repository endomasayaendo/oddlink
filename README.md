# OddLink

**"Where links get odd"** — ランダム文字列の代わりに、シュールな英語フレーズで短縮URLを生成するサービス。

```
https://example.com/very/long/url
  ↓
http://oddlink.com/purple-cat-dances-with-golden-whale
```

## なぜ作ったか

一般的なURL短縮サービスは `abc123` のようなランダム文字列を使う。機能的には十分だが、人間にとっては意味のない文字の羅列でしかない。

OddLinkでは「形容詞 + 名詞 + 動詞」などの英語フレーズを組み合わせることで、**共有したくなるURL**を生成する。記憶に残りやすく、リンクを受け取った側も思わず見てしまう「引っかかり」を作ることを狙った。

## 技術的なこだわり

### フレーズ衝突のリトライ戦略

ランダム生成である以上、既存のショートコードと衝突する可能性がある。OddLinkでは以下のアプローチで対処している:

- **楽観的アプローチ**: 事前のユニークチェック（SELECT）を省き、保存時の一意制約違反（`DataIntegrityViolationException`）で衝突を検知
- **トランザクション分離**: 保存処理を `REQUIRES_NEW` で独立トランザクションにし、リトライ時に前回の失敗が影響しないよう設計
- **最大5回リトライ**: 衝突が続く場合は503を返し、サイレントな無限ループを防止

事前チェックではなく一意制約違反をトリガーにした理由は、チェックと保存の間にレースコンディションが起きるため。DBの制約に頼る方が確実。

### ThreadLocalRandomによるフレーズ生成

当初はDBシーケンス + ソルトでシードを生成していたが、フレーズ生成のたびにDBアクセスが発生するN+1的な無駄があった。`ThreadLocalRandom`に切り替えることで:

- DBアクセスをゼロに（フレーズ生成時）
- スレッドセーフを保証（スレッドごとに独立したRandom）
- 十分なランダム性を確保

### 単語のインメモリキャッシュ

形容詞・名詞・動詞・副詞の全単語をアプリ起動時にDBからロードし、メモリ上に保持（`WordCache`）。フレーズ生成時のDBアクセスを完全に排除し、O(1)で単語を取得できるようにした。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | Java 21 / Spring Boot 3.5.9 |
| フロントエンド | React 19 / TypeScript 5.9 / Vite 7 |
| DB | PostgreSQL 17（Docker） |
| マイグレーション | Flyway |

## セットアップ

### 前提条件

- Java 21+
- Node.js 18+
- Docker

### 1. リポジトリをクローン

```bash
git clone https://github.com/your-name/oddlink.git
cd oddlink
```

### 2. 環境変数を設定

```bash
cp .env.example .env
```

`.env` を編集してDBのパスワードを設定する。

### 3. DB起動

```bash
docker compose up -d
```

### 4. バックエンド起動

```bash
./mvnw spring-boot:run
```

http://localhost:8080 で起動。

### 5. フロントエンド起動

```bash
cd frontend
npm install
npm run dev
```

http://localhost:3000 で起動。

## API仕様

### URL発行

```
POST /issue
Content-Type: application/json
```

リクエスト:
```json
{
  "originalUrl": "https://example.com"
}
```

レスポンス:
```json
{
  "shortUrl": "http://localhost:8080/purple-cat-dances-with-golden-whale"
}
```

### リダイレクト

```
GET /{shortCode}
```

- 存在する場合: 302リダイレクト（元のURLへ）
- 存在しない/期限切れ: 302リダイレクト（Not Foundページへ）

## プロジェクト構成

```
oddlink/
├── src/main/java/com/oddlink/
│   ├── controller/        # REST API
│   ├── service/           # ビジネスロジック
│   ├── entity/            # JPAエンティティ
│   ├── repository/        # データアクセス
│   ├── dto/               # リクエスト/レスポンス
│   ├── exception/         # 例外ハンドリング
│   └── config/            # CORS等の設定
├── src/main/resources/
│   ├── application.yml
│   └── db/migration/      # Flywayマイグレーション
├── frontend/
│   ├── src/
│   │   ├── components/    # UrlForm, ResultCard, ErrorMessage
│   │   ├── pages/         # NotFound
│   │   └── hooks/         # useShorten
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
└── pom.xml
```

## テスト

```bash
# バックエンド
./mvnw test

# 全27テスト（コントローラー・サービス・エンティティ）
```

## フレーズ生成パターン

6種類のパターンからランダムに生成:

| パターン | 例 |
|---------|-----|
| 形容詞-名詞-動詞-to-形容詞-名詞 | golden-clock-whispers-to-silent-butterfly |
| 名詞-of-形容詞-名詞-動詞 | echo-of-forgotten-piano-fades |
| 形容詞-名詞-動詞-with-形容詞-名詞 | floating-whale-dances-with-broken-mirror |
| 動詞-形容詞-名詞-into-名詞 | melts-ancient-key-into-shadow |
| 形容詞-名詞-副詞-動詞 | silent-cat-gently-whispers |
| 名詞-副詞-動詞-形容詞-名詞 | shadow-slowly-becomes-golden-light |

## 今後の展望

### スケーラビリティ
- **単語プールの拡張**: 現状は約130語で数千万パターンを生成可能だが、登録数増加に伴い衝突率が上がる。単語の追加やパターン追加で組み合わせ空間を拡張する
- **期限切れURLの定期削除**: 現状は期限切れURLがDB上に残り続ける。スケジューラによる定期削除でショートコード空間を解放する

### 機能
- **アクセス統計**: クリック数・リファラー・地域などの分析ダッシュボード
- **レートリミット**: API乱用防止のためのリクエスト制限

### インフラ
- **CI/CD**: GitHub Actionsによるテスト自動化とデプロイパイプライン
- **本番デプロイ**: Renderへのデプロイ（Spring Bootがフロントエンドも配信する構成）
