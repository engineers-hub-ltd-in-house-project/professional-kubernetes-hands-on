# --- ビルダーステージ ---
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
# ここでは本番用と開発用の両方の依存関係をインストール
RUN npm install
COPY . .
# アプリケーションのビルドやテストをここで実行する（今回は省略）

# --- プロダクションステージ ---
FROM node:18-slim AS production
WORKDIR /app
# ビルダーステージから、本番用の依存関係だけをコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
# アプリケーションコードをコピー
COPY --from=builder /app/index.js ./

EXPOSE 3000
CMD [ "node", "index.js" ]
