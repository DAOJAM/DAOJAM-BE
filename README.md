# DAOJam 后端

## Database related

[How to update database parameters in AWS Lightsail Database](https://lightsail.aws.amazon.com/ls/docs/en_us/articles/amazon-lightsail-updating-database-parameters)

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

