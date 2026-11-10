FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv tesseract-ocr tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PYTHON_BIN=/opt/venv/bin/python
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY requirements.txt ./
RUN /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY . .
RUN npm run build && mkdir -p /app/data && chown -R node:node /app/data
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health',{headers:process.env.APP_USER?{Authorization:'Basic '+Buffer.from(process.env.APP_USER+':'+process.env.APP_PASSWORD).toString('base64')}:{}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
