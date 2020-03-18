# Matataki 后端

## 目录

```bash
.
├── Dockerfile
├── README.md
├── app
├── app.js
├── appveyor.yml
├── config
├── db_dump.sql
├── db_memo.sql
├── doc.md
├── docker-compose.yml
├── docs
├── ipfs-backup.sh
├── jsconfig.json
├── logs
├── node_modules
├── package-lock.json
├── package.json
├── run
├── scripts
├── server-deployment.md
├── smartsignature
├── test
├── typings
├── update_prod
├── uploads
└── yarn.lock
```

## QuickStart

<!-- add docs here for user -->

see [egg docs][egg] for more detail.

### Development

```bash
$ npm i
$ npm run dev
$ open http://localhost:7001/
```

### Deploy

```bash

Deploy prod:

cd /dist/to/smart-signature-backend

docker-cmopose up -d --build prod


```


```bash

Deploy test

cd /dist/to/smart-signature-backend

docker-cmopose up -d --build test

```


```bash

Deploy ipfs-service

cd /dist/to/ipfs-service

docker-cmopose up -d --build 

```

