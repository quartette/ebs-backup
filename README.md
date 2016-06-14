
「Backup-Generation」タグがついたインスタンスのEBSバックアップを取得する。

http://qiita.com/eiroh/items/66bb68d12bd8fdbbd076

serverlessの勉強がてら、上記を参考にnode.jsで作りました

```
$ git clone https://github.com/quartette/ebs-backup.git
$ cd ebs-backup
$ serverless project init
$ npm install
$ cd functions/backup
$ npm install
```

### ローカル実行
```
$ serverless function run backup
```
デフォルトでDryRunをtrueにしてあるので実際にスナップショットを作成する際はfalseにしてください。

