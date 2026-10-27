FROM node:22-alpine
WORKDIR /app

# وابستگی‌ها
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# کد برنامه و دارایی‌ها
COPY . .
RUN node scripts/copy-ocr-assets.mjs

ENV NODE_ENV=production
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/v2/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
