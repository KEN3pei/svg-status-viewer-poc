# SVG Status Viewer PoC

draw.ioで作ったSVGの図形IDに、`status.json` の状態を反映する最小PoCです。

<img width="1435" height="748" alt="スクリーンショット 2026-08-02 11 16 35" src="https://github.com/user-attachments/assets/59b00a2a-cc5d-47d1-85d3-0e2a89321121" />

## 目的

- draw.ioでは図の配置と図形IDだけを管理する
- ビューア側でSVGを読み込み、状態に応じて枠線色を変える
- 将来的に `status.json` の生成元を Datadog API、Prometheus、Cloud Monitoring などへ差し替える

## 起動

```bash
cd ~/Apps/svg-status-viewer-poc
npm start
```

ブラウザで以下を開きます。

```text
http://localhost:4173
```

## ファイル構成

```text
viewer.html          ブラウザで開くビューア
app.js               SVGとstatus.jsonを読み込み、状態を反映する処理
styles.css           ビューアのスタイル
server.mjs           依存なしの静的HTTPサーバー
collector/           status.jsonを生成するcollector
sample/homelab.svg   サンプルSVG
sample/status.json   サンプル状態データ
docs/adr/            技術選定のADR
```

## 技術選定

SVG処理にブラウザJavaScriptを使う判断はADRに記録しています。

```text
docs/adr/0001-use-browser-javascript-for-svg-status-rendering.md
```

## draw.io側でやること

draw.io側では、状態を変えたい図形にIDを付けてSVGとしてexportします。
図形の種類、配置、線種、線幅、角丸、通常時の見た目はdraw.io側で管理します。viewer側は状態に応じた色とアニメーションだけを上書きします。

例:

```text
controlplane-01
worker-01
worker-02
worker-03
```

draw.ioのSVGでは、実際のSVG IDが `cell-worker01` のようになる場合や、`data-cell-id="worker01"` のような属性になる場合があります。このPoCは以下を探します。

```text
worker01
cell-worker01
data-cell-id="worker01"
```

viewerはSVG export時の `width` / `height` を尊重して等倍表示します。表示領域を超える場合はdiagram panel内でスクロールします。図の表示サイズを変えたい場合はdraw.io側のページサイズやexport設定を調整します。

## 状態データ

`sample/status.json` を編集すると表示が変わります。Auto refresh が有効なら10秒ごとに再読み込みします。

```json
{
  "generatedAt": "2026-08-01T04:45:00Z",
  "items": [
    {
      "id": "worker03",
      "kind": "component",
      "state": "alert",
      "message": "NodeNotReady",
      "appearance": {
        "preset": "alert"
      }
    }
  ]
}
```

対応している `state` は以下です。

```text
ok       緑系のアニメーション
warning  黄
alert    赤
unknown  灰
```

## Kubernetes collector

ローカルから `kubectl` で対象clusterを操作できる場合、k8s Node状態から `sample/status.json` を生成できます。

まず `collector/k8s-config.json` の `resource.name` を実際のNode名に合わせます。`id` はdraw.io SVG側の `data-cell-id` と一致させます。

```json
{
  "id": "worker01",
  "resource": {
    "kind": "Node",
    "name": "worker-01"
  }
}
```

一度だけ生成する場合:

```bash
npm run collect:k8s
```

1分ごとに更新する場合:

```bash
npm run collect:k8s:watch
```

更新間隔を変える場合:

```bash
COLLECT_INTERVAL_MS=300000 npm run collect:k8s:watch
```

Node状態は以下のように正規化します。

```text
Ready=True                         ok
Ready=True かつ SchedulingDisabled warning
Ready=False                        alert
Ready=Unknown またはNode未検出      unknown
```

## 実運用への拡張イメージ

このPoCでは `status.json` を手で編集します。実運用では、別プロセスでDatadog APIやPrometheus APIを読んで `status.json` または同等のAPIレスポンスを生成します。

例:

```text
Datadog Monitor API
  -> component_idごとの状態に正規化
  -> /api/status.json
  -> viewer.htmlがSVGに反映
```

Kubernetes node状態なら、`kube-state-metrics` やDatadog Agent由来の値を `ok` / `warning` / `alert` に正規化すると扱いやすいです。
